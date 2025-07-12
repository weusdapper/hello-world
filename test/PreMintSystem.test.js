const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PreMint Payment System", function () {
    let contract;
    let owner, merchant, processor, customer;
    let tokenId = 1;
    let preMintId;

    beforeEach(async function () {
        [owner, merchant, processor, customer] = await ethers.getSigners();

        const PaymentProcessorERC1155 = await ethers.getContractFactory("PaymentProcessorERC1155");
        contract = await PaymentProcessorERC1155.deploy(
            "Payment NFT",
            "PNFT",
            "https://api.example.com/metadata/"
        );

        // Setup roles
        await contract.addMerchant(merchant.address);
        await contract.addPaymentProcessor(processor.address);

        // Create a token
        await contract.connect(merchant).createToken(
            merchant.address,
            "premium-membership", 
            1000,
            "https://api.example.com/metadata/premium-membership.json"
        );
    });

    describe("Pre-Mint Token Creation", function () {
        it("Should create pre-mint token successfully", async function () {
            const tx = await contract.connect(merchant).createPreMintToken(
                tokenId,
                "premium-membership",
                "apple_pay",
                ethers.parseEther("0.05"),
                '{"name":"Premium Membership","description":"VIP access"}'
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    const parsed = contract.interface.parseLog(log);
                    return parsed.name === "PreMintTokenCreated";
                } catch (e) {
                    return false;
                }
            });
            const parsedEvent = contract.interface.parseLog(event);
            
            expect(parsedEvent.args.tokenId).to.equal(tokenId);
            expect(parsedEvent.args.merchant).to.equal(merchant.address);
            expect(parsedEvent.args.productId).to.equal("premium-membership");
            expect(parsedEvent.args.paymentProvider).to.equal("apple_pay");
            expect(parsedEvent.args.price).to.equal(ethers.parseEther("0.05"));

            preMintId = parsedEvent.args.preMintId;
        });

        it("Should fail to create pre-mint token for non-existent token", async function () {
            await expect(
                contract.connect(merchant).createPreMintToken(
                    999, // non-existent token
                    "test-product",
                    "stripe",
                    ethers.parseEther("0.01"),
                    "{}"
                )
            ).to.be.revertedWith("Token does not exist");
        });

        it("Should fail if not merchant", async function () {
            await expect(
                contract.connect(customer).createPreMintToken(
                    tokenId,
                    "test-product",
                    "stripe",
                    ethers.parseEther("0.01"),
                    "{}"
                )
            ).to.be.reverted;
        });
    });

    describe("Payment Confirmation and Auto-Minting", function () {
        beforeEach(async function () {
            // Create pre-mint token
            const tx = await contract.connect(merchant).createPreMintToken(
                tokenId,
                "premium-membership",
                "apple_pay",
                ethers.parseEther("0.05"),
                '{"name":"Premium Membership"}'
            );
            const receipt = await tx.wait();
            preMintId = receipt.events.find(e => e.event === "PreMintTokenCreated").args.preMintId;
        });

        it("Should confirm Apple Pay payment and mint NFT", async function () {
            const paymentIntentId = "pi_apple_pay_123456789";
            const amountPaid = ethers.parseEther("0.05");

            const tx = await contract.connect(processor).confirmPaymentAndMint(
                paymentIntentId,
                preMintId,
                customer.address,
                amountPaid
            );

            const receipt = await tx.wait();
            
            // Check PaymentConfirmed event
            const paymentEvent = receipt.events.find(e => e.event === "PaymentConfirmed");
            expect(paymentEvent.args.paymentIntentId).to.equal(paymentIntentId);
            expect(paymentEvent.args.customer).to.equal(customer.address);
            expect(paymentEvent.args.paymentProvider).to.equal("apple_pay");

            // Check NFTAutoMinted event
            const mintEvent = receipt.events.find(e => e.event === "NFTAutoMinted");
            expect(mintEvent.args.tokenId).to.equal(tokenId);
            expect(mintEvent.args.customer).to.equal(customer.address);
            expect(mintEvent.args.paymentIntentId).to.equal(paymentIntentId);

            // Verify NFT was minted
            const balance = await contract.balanceOf(customer.address, tokenId);
            expect(balance).to.equal(1);

            // Verify payment was marked as processed
            const isProcessed = await contract.isPaymentProcessed(paymentIntentId);
            expect(isProcessed).to.be.true;
        });

        it("Should confirm Stripe payment and mint NFT", async function () {
            // Create Stripe pre-mint token
            const stripeTx = await contract.connect(merchant).createPreMintToken(
                tokenId,
                "stripe-product",
                "stripe",
                ethers.parseEther("0.03"),
                '{"name":"Stripe NFT"}'
            );
            const stripeReceipt = await stripeTx.wait();
            const stripePreMintId = stripeReceipt.events.find(e => e.event === "PreMintTokenCreated").args.preMintId;

            const paymentIntentId = "pi_stripe_987654321";
            const amountPaid = ethers.parseEther("0.03");

            await contract.connect(processor).confirmPaymentAndMint(
                paymentIntentId,
                stripePreMintId,
                customer.address,
                amountPaid
            );

            const balance = await contract.balanceOf(customer.address, tokenId);
            expect(balance).to.equal(1);
        });

        it("Should fail if payment already processed", async function () {
            const paymentIntentId = "pi_duplicate_test";
            const amountPaid = ethers.parseEther("0.05");

            // First payment
            await contract.connect(processor).confirmPaymentAndMint(
                paymentIntentId,
                preMintId,
                customer.address,
                amountPaid
            );

            // Second payment with same intent ID should fail
            await expect(
                contract.connect(processor).confirmPaymentAndMint(
                    paymentIntentId,
                    preMintId,
                    customer.address,
                    amountPaid
                )
            ).to.be.revertedWith("Payment already processed");
        });

        it("Should fail if insufficient payment amount", async function () {
            const paymentIntentId = "pi_insufficient_payment";
            const insufficientAmount = ethers.parseEther("0.01"); // Less than required 0.05

            await expect(
                contract.connect(processor).confirmPaymentAndMint(
                    paymentIntentId,
                    preMintId,
                    customer.address,
                    insufficientAmount
                )
            ).to.be.revertedWith("Insufficient payment amount");
        });

        it("Should fail if not payment processor", async function () {
            const paymentIntentId = "pi_unauthorized";
            const amountPaid = ethers.parseEther("0.05");

            await expect(
                contract.connect(customer).confirmPaymentAndMint(
                    paymentIntentId,
                    preMintId,
                    customer.address,
                    amountPaid
                )
            ).to.be.reverted;
        });
    });

    describe("Batch Payment Confirmation", function () {
        let preMintIds = [];

        beforeEach(async function () {
            // Create multiple pre-mint tokens
            for (let i = 0; i < 3; i++) {
                const tx = await contract.connect(merchant).createPreMintToken(
                    tokenId,
                    `product-${i}`,
                    "batch_processor",
                    ethers.parseEther("0.01"),
                    `{"name":"Batch Product ${i}"}`
                );
                const receipt = await tx.wait();
                const preMintId = receipt.events.find(e => e.event === "PreMintTokenCreated").args.preMintId;
                preMintIds.push(preMintId);
            }
        });

        it("Should batch confirm payments and mint NFTs", async function () {
            const paymentIntentIds = ["pi_batch_1", "pi_batch_2", "pi_batch_3"];
            const customers = [customer.address, customer.address, customer.address];
            const amounts = [
                ethers.parseEther("0.01"),
                ethers.parseEther("0.01"),
                ethers.parseEther("0.01")
            ];

            await contract.connect(processor).batchConfirmPaymentsAndMint(
                paymentIntentIds,
                preMintIds,
                customers,
                amounts
            );

            // Verify all NFTs were minted
            const balance = await contract.balanceOf(customer.address, tokenId);
            expect(balance).to.equal(3);

            // Verify all payments were processed
            for (const paymentId of paymentIntentIds) {
                const isProcessed = await contract.isPaymentProcessed(paymentId);
                expect(isProcessed).to.be.true;
            }
        });
    });

    describe("Pre-Mint Token Management", function () {
        beforeEach(async function () {
            const tx = await contract.connect(merchant).createPreMintToken(
                tokenId,
                "test-product",
                "test_provider",
                ethers.parseEther("0.02"),
                '{"name":"Test Product"}'
            );
            const receipt = await tx.wait();
            preMintId = receipt.events.find(e => e.event === "PreMintTokenCreated").args.preMintId;
        });

        it("Should get pre-mint token details", async function () {
            const preMintToken = await contract.getPreMintToken(preMintId);
            
            expect(preMintToken.tokenId).to.equal(tokenId);
            expect(preMintToken.merchant).to.equal(merchant.address);
            expect(preMintToken.productId).to.equal("test-product");
            expect(preMintToken.paymentProvider).to.equal("test_provider");
            expect(preMintToken.price).to.equal(ethers.parseEther("0.02"));
            expect(preMintToken.isActive).to.be.true;
        });

        it("Should deactivate pre-mint token", async function () {
            await contract.connect(merchant).deactivatePreMintToken(preMintId);
            
            const preMintToken = await contract.getPreMintToken(preMintId);
            expect(preMintToken.isActive).to.be.false;
        });

        it("Should fail to confirm payment for deactivated pre-mint token", async function () {
            await contract.connect(merchant).deactivatePreMintToken(preMintId);
            
            await expect(
                contract.connect(processor).confirmPaymentAndMint(
                    "pi_deactivated_test",
                    preMintId,
                    customer.address,
                    ethers.parseEther("0.02")
                )
            ).to.be.revertedWith("Pre-mint token not active");
        });

        it("Should get current pre-mint ID counter", async function () {
            const currentId = await contract.getCurrentPreMintId();
            expect(currentId).to.be.gt(0);
        });
    });

    describe("Supply Limits", function () {
        it("Should respect max supply limits", async function () {
            // Create token with max supply of 1
            await contract.connect(merchant).createToken(
                merchant.address,
                "limited-edition", 
                1,
                "https://api.example.com/metadata/limited-edition.json"
            );
            const limitedTokenId = 2;

            // Create pre-mint token
            const tx = await contract.connect(merchant).createPreMintToken(
                limitedTokenId,
                "limited-product",
                "apple_pay",
                ethers.parseEther("0.1"),
                '{"name":"Limited Edition"}'
            );
            const receipt = await tx.wait();
            const limitedPreMintId = receipt.events.find(e => e.event === "PreMintTokenCreated").args.preMintId;

            // First mint should succeed
            await contract.connect(processor).confirmPaymentAndMint(
                "pi_limited_1",
                limitedPreMintId,
                customer.address,
                ethers.parseEther("0.1")
            );

            // Second mint should fail due to supply limit
            await expect(
                contract.connect(processor).confirmPaymentAndMint(
                    "pi_limited_2",
                    limitedPreMintId,
                    customer.address,
                    ethers.parseEther("0.1")
                )
            ).to.be.revertedWith("Exceeds maximum supply");
        });
    });
});

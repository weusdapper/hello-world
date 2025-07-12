const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PreMint Payment System - Simple Tests", function () {
    let contract;
    let owner, merchant, processor, customer;
    let tokenId = 1;

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

            await tx.wait();
            
            // Verify pre-mint token was created by checking counter
            const currentPreMintId = await contract.getCurrentPreMintId();
            expect(currentPreMintId).to.equal(1);
            
            // Get pre-mint token details
            const preMintToken = await contract.getPreMintToken(0);
            expect(preMintToken.tokenId).to.equal(tokenId);
            expect(preMintToken.merchant).to.equal(merchant.address);
            expect(preMintToken.productId).to.equal("premium-membership");
            expect(preMintToken.paymentProvider).to.equal("apple_pay");
            expect(preMintToken.price).to.equal(ethers.parseEther("0.05"));
            expect(preMintToken.isActive).to.be.true;
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
    });

    describe("Payment Confirmation and Auto-Minting", function () {
        let preMintId = 0;

        beforeEach(async function () {
            // Create pre-mint token
            await contract.connect(merchant).createPreMintToken(
                tokenId,
                "premium-membership",
                "apple_pay",
                ethers.parseEther("0.05"),
                '{"name":"Premium Membership"}'
            );
        });

        it("Should confirm Apple Pay payment and mint NFT", async function () {
            const paymentIntentId = "pi_apple_pay_123456789";
            const amountPaid = ethers.parseEther("0.05");

            // Check initial balance
            const initialBalance = await contract.balanceOf(customer.address, tokenId);
            expect(initialBalance).to.equal(0);

            // Confirm payment and mint
            await contract.connect(processor).confirmPaymentAndMint(
                paymentIntentId,
                preMintId,
                customer.address,
                amountPaid
            );

            // Verify NFT was minted
            const finalBalance = await contract.balanceOf(customer.address, tokenId);
            expect(finalBalance).to.equal(1);

            // Verify payment was marked as processed
            const isProcessed = await contract.isPaymentProcessed(paymentIntentId);
            expect(isProcessed).to.be.true;
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
    });

    describe("Batch Payment Confirmation", function () {
        let preMintIds = [];

        beforeEach(async function () {
            // Create multiple pre-mint tokens
            for (let i = 0; i < 3; i++) {
                await contract.connect(merchant).createPreMintToken(
                    tokenId,
                    `product-${i}`,
                    "batch_processor",
                    ethers.parseEther("0.01"),
                    `{"name":"Batch Product ${i}"}`
                );
                preMintIds.push(i);
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

            // Check initial balance
            const initialBalance = await contract.balanceOf(customer.address, tokenId);

            await contract.connect(processor).batchConfirmPaymentsAndMint(
                paymentIntentIds,
                preMintIds,
                customers,
                amounts
            );

            // Verify all NFTs were minted
            const finalBalance = await contract.balanceOf(customer.address, tokenId);
            expect(finalBalance).to.equal(initialBalance + BigInt(3));

            // Verify all payments were processed
            for (const paymentId of paymentIntentIds) {
                const isProcessed = await contract.isPaymentProcessed(paymentId);
                expect(isProcessed).to.be.true;
            }
        });
    });

    describe("Pre-Mint Token Management", function () {
        let preMintId = 0;

        beforeEach(async function () {
            await contract.connect(merchant).createPreMintToken(
                tokenId,
                "test-product",
                "test_provider",
                ethers.parseEther("0.02"),
                '{"name":"Test Product"}'
            );
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
            await contract.connect(merchant).createPreMintToken(
                limitedTokenId,
                "limited-product",
                "apple_pay",
                ethers.parseEther("0.1"),
                '{"name":"Limited Edition"}'
            );
            
            // Get the actual pre-mint ID
            const currentPreMintId = await contract.getCurrentPreMintId();
            const limitedPreMintId = currentPreMintId - BigInt(1); // Last created pre-mint token

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

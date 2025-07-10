const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PaymentProcessorERC1155", function () {
    let contract;
    let owner, merchant, processor, customer, otherAccount;
    let tokenId;

    beforeEach(async function () {
        [owner, merchant, processor, customer, otherAccount] = await ethers.getSigners();

        const PaymentProcessorERC1155 = await ethers.getContractFactory("PaymentProcessorERC1155");
        contract = await PaymentProcessorERC1155.deploy(
            "Test NFTs",
            "TNFT",
            "https://api.test.com/metadata/"
        );
        await contract.deployed();

        // Set up roles
        await contract.addMerchant(merchant.address);
        await contract.addPaymentProcessor(processor.address);
    });

    describe("Deployment", function () {
        it("Should set the correct name and symbol", async function () {
            expect(await contract.name()).to.equal("Test NFTs");
            expect(await contract.symbol()).to.equal("TNFT");
        });

        it("Should grant admin role to deployer", async function () {
            const adminRole = await contract.DEFAULT_ADMIN_ROLE();
            expect(await contract.hasRole(adminRole, owner.address)).to.be.true;
        });
    });

    describe("Token Creation", function () {
        it("Should allow merchants to create tokens", async function () {
            const tx = await contract.connect(merchant).createToken(
                merchant.address,
                "PRODUCT_001",
                1000,
                "https://api.test.com/token/1.json"
            );

            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "TokenCreated");
            tokenId = event.args.tokenId;

            expect(tokenId).to.equal(1);
            expect(event.args.merchant).to.equal(merchant.address);
            expect(event.args.productId).to.equal("PRODUCT_001");
            expect(event.args.maxSupply).to.equal(1000);
        });

        it("Should not allow non-merchants to create tokens", async function () {
            await expect(
                contract.connect(customer).createToken(
                    merchant.address,
                    "PRODUCT_002",
                    1000,
                    "https://api.test.com/token/2.json"
                )
            ).to.be.reverted;
        });

        it("Should not allow duplicate product IDs", async function () {
            await contract.connect(merchant).createToken(
                merchant.address,
                "PRODUCT_001",
                1000,
                "https://api.test.com/token/1.json"
            );

            await expect(
                contract.connect(merchant).createToken(
                    merchant.address,
                    "PRODUCT_001",
                    500,
                    "https://api.test.com/token/1b.json"
                )
            ).to.be.revertedWith("Product ID already exists");
        });
    });

    describe("NFT Minting", function () {
        beforeEach(async function () {
            const tx = await contract.connect(merchant).createToken(
                merchant.address,
                "PRODUCT_001",
                1000,
                "https://api.test.com/token/1.json"
            );
            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "TokenCreated");
            tokenId = event.args.tokenId;
        });

        it("Should allow payment processors to mint NFTs", async function () {
            const tx = await contract.connect(processor).mintForPurchase(
                customer.address,
                tokenId,
                5,
                "TX_12345",
                "0x"
            );

            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "NFTMintedForPurchase");

            expect(event.args.tokenId).to.equal(tokenId);
            expect(event.args.customer).to.equal(customer.address);
            expect(event.args.merchant).to.equal(merchant.address);
            expect(event.args.transactionId).to.equal("TX_12345");
            expect(event.args.amount).to.equal(5);

            expect(await contract.balanceOf(customer.address, tokenId)).to.equal(5);
            expect(await contract.tokenSupply(tokenId)).to.equal(5);
        });

        it("Should not allow non-processors to mint NFTs", async function () {
            await expect(
                contract.connect(customer).mintForPurchase(
                    customer.address,
                    tokenId,
                    1,
                    "TX_12345",
                    "0x"
                )
            ).to.be.reverted;
        });

        it("Should prevent duplicate transaction processing", async function () {
            await contract.connect(processor).mintForPurchase(
                customer.address,
                tokenId,
                1,
                "TX_12345",
                "0x"
            );

            await expect(
                contract.connect(processor).mintForPurchase(
                    customer.address,
                    tokenId,
                    1,
                    "TX_12345",
                    "0x"
                )
            ).to.be.revertedWith("Transaction already processed");
        });

        it("Should respect maximum supply limits", async function () {
            // Create token with max supply of 10
            const tx = await contract.connect(merchant).createToken(
                merchant.address,
                "LIMITED_PRODUCT",
                10,
                "https://api.test.com/token/limited.json"
            );
            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "TokenCreated");
            const limitedTokenId = event.args.tokenId;

            // Mint 10 tokens (should succeed)
            await contract.connect(processor).mintForPurchase(
                customer.address,
                limitedTokenId,
                10,
                "TX_LIMIT_1",
                "0x"
            );

            // Try to mint 1 more (should fail)
            await expect(
                contract.connect(processor).mintForPurchase(
                    customer.address,
                    limitedTokenId,
                    1,
                    "TX_LIMIT_2",
                    "0x"
                )
            ).to.be.revertedWith("Exceeds maximum supply");
        });
    });

    describe("Batch Minting", function () {
        let tokenId1, tokenId2;

        beforeEach(async function () {
            // Create two tokens
            let tx = await contract.connect(merchant).createToken(
                merchant.address,
                "PRODUCT_001",
                1000,
                "https://api.test.com/token/1.json"
            );
            let receipt = await tx.wait();
            tokenId1 = receipt.events.find(e => e.event === "TokenCreated").args.tokenId;

            tx = await contract.connect(merchant).createToken(
                merchant.address,
                "PRODUCT_002",
                1000,
                "https://api.test.com/token/2.json"
            );
            receipt = await tx.wait();
            tokenId2 = receipt.events.find(e => e.event === "TokenCreated").args.tokenId;
        });

        it("Should allow batch minting", async function () {
            await contract.connect(processor).batchMintForPurchases(
                [customer.address, customer.address],
                [tokenId1, tokenId2],
                [3, 2],
                ["TX_BATCH_1", "TX_BATCH_2"]
            );

            expect(await contract.balanceOf(customer.address, tokenId1)).to.equal(3);
            expect(await contract.balanceOf(customer.address, tokenId2)).to.equal(2);
        });

        it("Should require matching array lengths", async function () {
            await expect(
                contract.connect(processor).batchMintForPurchases(
                    [customer.address],
                    [tokenId1, tokenId2],
                    [3, 2],
                    ["TX_BATCH_1", "TX_BATCH_2"]
                )
            ).to.be.revertedWith("Array lengths must match");
        });
    });

    describe("Access Control", function () {
        it("Should allow admin to add/remove payment processors", async function () {
            const newProcessor = otherAccount.address;
            
            await contract.addPaymentProcessor(newProcessor);
            expect(await contract.authorizedProcessors(newProcessor)).to.be.true;

            await contract.removePaymentProcessor(newProcessor);
            expect(await contract.authorizedProcessors(newProcessor)).to.be.false;
        });

        it("Should allow admin to add/remove merchants", async function () {
            const newMerchant = otherAccount.address;
            
            await contract.addMerchant(newMerchant);
            expect(await contract.authorizedMerchants(newMerchant)).to.be.true;

            await contract.removeMerchant(newMerchant);
            expect(await contract.authorizedMerchants(newMerchant)).to.be.false;
        });

        it("Should not allow non-admins to manage roles", async function () {
            await expect(
                contract.connect(customer).addPaymentProcessor(otherAccount.address)
            ).to.be.reverted;

            await expect(
                contract.connect(customer).addMerchant(otherAccount.address)
            ).to.be.reverted;
        });
    });

    describe("URI Management", function () {
        beforeEach(async function () {
            const tx = await contract.connect(merchant).createToken(
                merchant.address,
                "PRODUCT_001",
                1000,
                "https://api.test.com/token/1.json"
            );
            const receipt = await tx.wait();
            tokenId = receipt.events.find(e => e.event === "TokenCreated").args.tokenId;
        });

        it("Should return correct token URI", async function () {
            expect(await contract.uri(tokenId)).to.equal("https://api.test.com/token/1.json");
        });

        it("Should allow URI updates", async function () {
            await contract.setTokenURI(tokenId, "https://api.test.com/token/1-updated.json");
            expect(await contract.uri(tokenId)).to.equal("https://api.test.com/token/1-updated.json");
        });
    });

    describe("Emergency Controls", function () {
        beforeEach(async function () {
            const tx = await contract.connect(merchant).createToken(
                merchant.address,
                "PRODUCT_001",
                1000,
                "https://api.test.com/token/1.json"
            );
            const receipt = await tx.wait();
            tokenId = receipt.events.find(e => e.event === "TokenCreated").args.tokenId;
        });

        it("Should allow admin to pause/unpause", async function () {
            await contract.pause();
            
            await expect(
                contract.connect(processor).mintForPurchase(
                    customer.address,
                    tokenId,
                    1,
                    "TX_PAUSED",
                    "0x"
                )
            ).to.be.revertedWith("Pausable: paused");

            await contract.unpause();
            
            await expect(
                contract.connect(processor).mintForPurchase(
                    customer.address,
                    tokenId,
                    1,
                    "TX_UNPAUSED",
                    "0x"
                )
            ).to.not.be.reverted;
        });
    });

    describe("Utility Functions", function () {
        beforeEach(async function () {
            const tx = await contract.connect(merchant).createToken(
                merchant.address,
                "PRODUCT_001",
                1000,
                "https://api.test.com/token/1.json"
            );
            const receipt = await tx.wait();
            tokenId = receipt.events.find(e => e.event === "TokenCreated").args.tokenId;
        });

        it("Should return correct token info", async function () {
            const info = await contract.getTokenInfo(tokenId);
            
            expect(info.exists).to.be.true;
            expect(info.currentSupply).to.equal(0);
            expect(info.maximumSupply).to.equal(1000);
            expect(info.creator).to.equal(merchant.address);
            expect(info.merchant).to.equal(merchant.address);
            expect(info.tokenURI).to.equal("https://api.test.com/token/1.json");
        });

        it("Should check transaction processing status", async function () {
            expect(
                await contract.isTransactionProcessed("TX_12345", tokenId, customer.address)
            ).to.be.false;

            await contract.connect(processor).mintForPurchase(
                customer.address,
                tokenId,
                1,
                "TX_12345",
                "0x"
            );

            expect(
                await contract.isTransactionProcessed("TX_12345", tokenId, customer.address)
            ).to.be.true;
        });
    });
});


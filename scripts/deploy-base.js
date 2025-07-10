const { ethers } = require("hardhat");

async function main() {
    console.log("Deploying PaymentProcessorERC1155 to Base network...");

    // Get the contract factory
    const PaymentProcessorERC1155 = await ethers.getContractFactory("PaymentProcessorERC1155");

    // Contract constructor parameters
    const name = "Payment Processor NFTs";
    const symbol = "PPNFT";
    const baseURI = "https://api.yourplatform.com/metadata/"; // Replace with your metadata API

    // Deploy the contract
    console.log("Deploying contract...");
    const contract = await PaymentProcessorERC1155.deploy(name, symbol, baseURI);
    
    // Wait for deployment to complete
    await contract.deployed();

    console.log("✅ Contract deployed successfully!");
    console.log("📍 Contract address:", contract.address);
    console.log("🔗 Base network explorer:", `https://basescan.org/address/${contract.address}`);
    
    // Verify deployment
    console.log("\n📋 Contract Details:");
    console.log("Name:", await contract.name());
    console.log("Symbol:", await contract.symbol());
    console.log("Base URI:", await contract.uri(0));
    
    // Save deployment info
    const deploymentInfo = {
        contractAddress: contract.address,
        network: "base",
        deploymentTime: new Date().toISOString(),
        contractName: "PaymentProcessorERC1155",
        constructor: {
            name,
            symbol,
            baseURI
        }
    };
    
    console.log("\n💾 Deployment Info:");
    console.log(JSON.stringify(deploymentInfo, null, 2));
    
    return contract;
}

// Execute deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });


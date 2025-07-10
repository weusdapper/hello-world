# Payment Processor Integration Guide

This guide explains how to integrate the PaymentProcessorERC1155 smart contract with payment processors like Apple Pay, Stripe, PayPal, etc.

## Overview

The PaymentProcessorERC1155 contract allows payment processors to automatically mint and distribute NFTs to customers after successful payments, with the payment processor covering all gas fees.

## Integration Flow

```
Customer Purchase → Payment Processor → Smart Contract → NFT Minted to Customer
```

1. **Customer makes purchase** using Apple Pay/other payment method
2. **Payment processor validates payment** and confirms transaction
3. **Payment processor calls smart contract** to mint NFT to customer
4. **Smart contract mints NFT** directly to customer's wallet
5. **Customer receives NFT** automatically

## Smart Contract Functions

### For Payment Processors

#### `mintForPurchase()`
Main function for minting NFTs after successful payment:

```solidity
function mintForPurchase(
    address customer,      // Customer's wallet address
    uint256 tokenId,       // Product token ID
    uint256 amount,        // Number of NFTs to mint
    string memory transactionId,  // Unique transaction ID
    bytes memory data      // Additional data (can be empty)
) external onlyRole(PAYMENT_PROCESSOR_ROLE)
```

#### `batchMintForPurchases()`
For processing multiple purchases in one transaction:

```solidity
function batchMintForPurchases(
    address[] memory customers,
    uint256[] memory tokenIds,
    uint256[] memory amounts,
    string[] memory transactionIds
) external onlyRole(PAYMENT_PROCESSOR_ROLE)
```

### For Merchants

#### `createToken()`
Create a new NFT product:

```solidity
function createToken(
    address merchant,      // Merchant's address
    string memory productId,  // Unique product identifier
    uint256 maxSupply,     // Maximum supply (0 for unlimited)
    string memory tokenURI // Metadata URI
) external onlyRole(MERCHANT_ROLE) returns (uint256)
```

## Integration Steps

### 1. Deploy Contract
```bash
npm install
npx hardhat compile
npx hardhat run scripts/deploy-base.js --network base
```

### 2. Set Up Roles

```javascript
// Add payment processor
await contract.addPaymentProcessor("0xPaymentProcessorAddress");

// Add merchant
await contract.addMerchant("0xMerchantAddress");
```

### 3. Create Product Tokens

```javascript
// Merchant creates a token for their product
const tokenId = await contract.createToken(
    merchantAddress,
    "PRODUCT_SKU_123",
    1000, // Max supply
    "https://api.merchant.com/metadata/product123.json"
);
```

### 4. Payment Processor Integration

```javascript
// After successful payment, mint NFT to customer
await contract.mintForPurchase(
    customerWalletAddress,
    tokenId,
    1, // Amount
    paymentTransactionId,
    "0x" // Empty data
);
```

## Example Integration Code

### Node.js/Express Integration

```javascript
const { ethers } = require('ethers');

class NFTPaymentProcessor {
    constructor(contractAddress, privateKey, rpcUrl) {
        this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.contract = new ethers.Contract(
            contractAddress,
            contractABI,
            this.wallet
        );
    }

    async processPaymentAndMintNFT(paymentData) {
        try {
            // 1. Validate payment with payment processor
            const paymentValid = await this.validatePayment(paymentData);
            if (!paymentValid) {
                throw new Error('Payment validation failed');
            }

            // 2. Get product token ID
            const tokenId = await this.contract.productIdToTokenId(paymentData.productId);
            if (tokenId.eq(0)) {
                throw new Error('Product not found');
            }

            // 3. Mint NFT to customer
            const tx = await this.contract.mintForPurchase(
                paymentData.customerAddress,
                tokenId,
                paymentData.quantity,
                paymentData.transactionId,
                "0x"
            );

            // 4. Wait for confirmation
            const receipt = await tx.wait();
            
            return {
                success: true,
                transactionHash: receipt.transactionHash,
                tokenId: tokenId.toString(),
                customer: paymentData.customerAddress
            };

        } catch (error) {
            console.error('NFT minting failed:', error);
            return { success: false, error: error.message };
        }
    }

    async validatePayment(paymentData) {
        // Implement payment validation logic
        // This would integrate with Apple Pay, Stripe, etc.
        return true;
    }
}
```

### Apple Pay Integration Example

```javascript
// Apple Pay webhook handler
app.post('/apple-pay-webhook', async (req, res) => {
    const paymentData = req.body;
    
    // Validate Apple Pay payment
    if (paymentData.status === 'completed') {
        // Extract customer wallet from payment metadata
        const customerWallet = paymentData.metadata.walletAddress;
        const productId = paymentData.metadata.productId;
        
        // Mint NFT
        const result = await nftProcessor.processPaymentAndMintNFT({
            customerAddress: customerWallet,
            productId: productId,
            quantity: 1,
            transactionId: paymentData.transactionId
        });
        
        if (result.success) {
            res.json({ 
                status: 'success', 
                nftTransaction: result.transactionHash 
            });
        } else {
            res.status(500).json({ 
                status: 'error', 
                message: result.error 
            });
        }
    }
});
```

## Gas Optimization

The contract is optimized for Base network with:
- Efficient storage patterns
- Batch operations support
- Minimal external calls
- Optimized for low gas costs on Base L2

## Security Features

- **Role-based access control**: Only authorized payment processors can mint
- **Transaction deduplication**: Prevents double-spending
- **Pausable**: Emergency stop functionality
- **ReentrancyGuard**: Prevents reentrancy attacks
- **Supply limits**: Configurable maximum supply per token

## Environment Variables

Create a `.env` file:

```
PRIVATE_KEY=your_private_key_here
BASESCAN_API_KEY=your_basescan_api_key
BASE_RPC_URL=https://mainnet.base.org
```

## Testing

```bash
npx hardhat test
```

## Deployment Costs

Estimated deployment costs on Base network:
- Contract deployment: ~$5-10 USD
- Token creation: ~$0.10-0.50 USD per token
- NFT minting: ~$0.05-0.20 USD per mint

## Support

For integration support, please refer to:
- [Base Network Documentation](https://docs.base.org/)
- [OpenZeppelin ERC1155 Guide](https://docs.openzeppelin.com/contracts/4.x/erc1155)
- [Hardhat Documentation](https://hardhat.org/docs)


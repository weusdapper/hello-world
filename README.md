# Payment Processor ERC-1155 Smart Contract

A comprehensive ERC-1155 smart contract designed for seamless integration with payment processors like Apple Pay, Stripe, and PayPal. This contract enables automatic NFT minting and distribution to customers after successful payments, with payment processors covering all gas fees on the Base blockchain network.

## 🚀 Features

- **Payment Processor Integration**: Direct integration with Apple Pay, Stripe, PayPal, and other payment processors
- **Automatic NFT Minting**: NFTs are automatically minted to customers after successful payments
- **Gas Fee Coverage**: Payment processors pay all blockchain transaction fees
- **Base Network Optimized**: Deployed on Base for low-cost, fast transactions
- **Role-Based Access Control**: Secure permission system for merchants and payment processors
- **Batch Operations**: Process multiple purchases in a single transaction
- **Supply Management**: Configurable maximum supply limits per product
- **Transaction Deduplication**: Prevents double-spending and duplicate minting
- **Emergency Controls**: Pausable functionality for security

## 📋 Contract Overview

### Key Components

1. **PaymentProcessorERC1155.sol** - Main smart contract
2. **Role-based permissions** - Merchants, Payment Processors, Admins
3. **Product token creation** - Each product gets a unique token ID
4. **Automatic minting** - NFTs minted directly to customer wallets
5. **Gas optimization** - Efficient for Base network deployment

### Smart Contract Functions

#### For Payment Processors
- `mintForPurchase()` - Mint NFT after successful payment
- `batchMintForPurchases()` - Process multiple purchases at once

#### For Merchants
- `createToken()` - Create new product tokens
- `setTokenURI()` - Update product metadata

#### For Admins
- `addPaymentProcessor()` - Authorize payment processors
- `addMerchant()` - Authorize merchants
- `pause()/unpause()` - Emergency controls

## 🛠 Installation & Setup

### Prerequisites
- Node.js v16+
- npm or yarn
- Hardhat development environment

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd payment-processor-erc1155

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### Environment Configuration

Edit `.env` file with your settings:

```env
PRIVATE_KEY=your_private_key_here
BASESCAN_API_KEY=your_basescan_api_key
BASE_URI=https://api.yourplatform.com/metadata/
```

## 🚀 Deployment

### Compile Contract
```bash
npm run compile
```

### Deploy to Base Network
```bash
# Deploy to Base Mainnet
npm run deploy:base

# Deploy to Base Sepolia Testnet
npm run deploy:base-testnet

# Deploy locally for testing
npm run deploy:local
```

### Verify Contract
```bash
npx hardhat verify --network base <CONTRACT_ADDRESS> "Contract Name" "SYMBOL" "https://api.example.com/metadata/"
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
npm test
```

Tests cover:
- Contract deployment
- Token creation
- NFT minting
- Access control
- Batch operations
- Emergency controls
- Edge cases and security

## 💡 Integration Guide

### 1. Set Up Roles

```javascript
// Add payment processor
await contract.addPaymentProcessor("0xPaymentProcessorAddress");

// Add merchant
await contract.addMerchant("0xMerchantAddress");
```

### 2. Create Product Tokens

```javascript
// Merchant creates tokens for their products
const tokenId = await contract.createToken(
    merchantAddress,
    "PRODUCT_SKU_123",
    1000, // Max supply (0 for unlimited)
    "https://api.merchant.com/metadata/product123.json"
);
```

### 3. Process Payments & Mint NFTs

```javascript
// After successful payment, mint NFT to customer
await contract.mintForPurchase(
    customerWalletAddress,
    tokenId,
    1, // Quantity
    paymentTransactionId,
    "0x" // Additional data
);
```

### Apple Pay Integration Example

```javascript
// Apple Pay webhook handler
app.post('/apple-pay-webhook', async (req, res) => {
    const paymentData = req.body;
    
    if (paymentData.status === 'completed') {
        const result = await contract.mintForPurchase(
            paymentData.metadata.walletAddress,
            paymentData.metadata.tokenId,
            1,
            paymentData.transactionId,
            "0x"
        );
        
        res.json({ 
            status: 'success', 
            nftTransaction: result.hash 
        });
    }
});
```

## 📊 Gas Costs (Base Network)

| Operation | Estimated Cost |
|-----------|----------------|
| Contract Deployment | $5-10 USD |
| Create Token | $0.10-0.50 USD |
| Mint NFT | $0.05-0.20 USD |
| Batch Mint (10 NFTs) | $0.30-0.80 USD |

## 🔒 Security Features

- **Access Control**: Role-based permissions using OpenZeppelin's AccessControl
- **Reentrancy Protection**: ReentrancyGuard prevents reentrancy attacks
- **Transaction Deduplication**: Prevents double-processing of payments
- **Pausable**: Emergency stop functionality
- **Supply Limits**: Configurable maximum supply per token
- **Input Validation**: Comprehensive parameter validation

## 🌐 Network Information

### Base Mainnet
- **Chain ID**: 8453
- **RPC URL**: https://mainnet.base.org
- **Explorer**: https://basescan.org

### Base Sepolia Testnet
- **Chain ID**: 84532
- **RPC URL**: https://sepolia.base.org
- **Explorer**: https://sepolia.basescan.org

## 📚 API Reference

### Contract Events

```solidity
event TokenCreated(uint256 indexed tokenId, address indexed merchant, string productId, uint256 maxSupply);
event NFTMintedForPurchase(uint256 indexed tokenId, address indexed customer, address indexed merchant, string transactionId, uint256 amount);
event PaymentProcessorAdded(address indexed processor);
event MerchantAdded(address indexed merchant);
```

### View Functions

```solidity
function getTokenInfo(uint256 tokenId) external view returns (bool exists, uint256 currentSupply, uint256 maximumSupply, address creator, address merchant, string memory tokenURI);
function isTransactionProcessed(string memory transactionId, uint256 tokenId, address customer) external view returns (bool);
function uri(uint256 tokenId) public view override returns (string memory);
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For integration support and questions:
- Create an issue in this repository
- Check the [Integration Guide](integration/PaymentProcessorIntegration.md)
- Review the [Base Network Documentation](https://docs.base.org/)

## 🔗 Useful Links

- [Base Network](https://base.org/)
- [OpenZeppelin Contracts](https://openzeppelin.com/contracts/)
- [ERC-1155 Standard](https://eips.ethereum.org/EIPS/eip-1155)
- [Hardhat Documentation](https://hardhat.org/docs)

---

Built with ❤️ for seamless Web3 commerce integration


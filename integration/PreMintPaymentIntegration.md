# Pre-Mint Payment Integration Guide

## Overview
The enhanced ERC-1155 contract now includes a **Pre-Mint System** that automatically mints NFTs when payments are confirmed from Apple Pay, Stripe, PayPal, or any payment processor.

## How It Works

### 1. Setup Phase (Merchant)
```solidity
// 1. Create a token type first
createToken("premium-membership", 1000); // tokenId: 1, max supply: 1000

// 2. Create a pre-mint token for Apple Pay
uint256 preMintId = createPreMintToken(
    1,                    // tokenId
    "premium-membership", // productId
    "apple_pay",         // paymentProvider
    50000000000000000,   // price in wei (0.05 ETH)
    '{"name":"Premium Membership","description":"VIP access token","image":"https://example.com/premium.png"}'
);
```

### 2. Payment Flow

#### Apple Pay Integration
```javascript
// Frontend: Customer initiates Apple Pay
const paymentRequest = {
    countryCode: 'US',
    currencyCode: 'USD',
    supportedNetworks: ['visa', 'masterCard'],
    merchantCapabilities: ['supports3DS'],
    total: {
        label: 'Premium Membership NFT',
        amount: '25.00'
    }
};

// When Apple Pay succeeds, your backend receives the payment
// Your payment processor then calls the smart contract
```

#### Backend Payment Confirmation
```javascript
// Your backend service (Node.js example)
const { ethers } = require('ethers');

async function confirmApplePayment(paymentIntentId, preMintId, customerAddress, amountPaid) {
    const contract = new ethers.Contract(contractAddress, abi, signer);
    
    // Convert amount to wei
    const amountInWei = ethers.utils.parseEther(amountPaid.toString());
    
    // Confirm payment and auto-mint NFT
    const tx = await contract.confirmPaymentAndMint(
        paymentIntentId,    // "pi_apple_pay_123456789"
        preMintId,          // 0 (from createPreMintToken)
        customerAddress,    // "0x742d35Cc6634C0532925a3b8D"
        amountInWei        // amount in wei
    );
    
    await tx.wait();
    console.log('NFT automatically minted to customer!');
}
```

### 3. Stripe Integration Example

```javascript
// Stripe webhook handler
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        
        // Extract metadata
        const preMintId = paymentIntent.metadata.preMintId;
        const customerAddress = paymentIntent.metadata.customerAddress;
        
        // Confirm payment on blockchain
        await confirmStripePayment(
            paymentIntent.id,
            preMintId,
            customerAddress,
            paymentIntent.amount_received / 100 // Convert cents to dollars
        );
    }
    
    res.json({received: true});
});
```

### 4. PayPal Integration Example

```javascript
// PayPal webhook handler
app.post('/webhook/paypal', async (req, res) => {
    const event = req.body;
    
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const capture = event.resource;
        
        // Confirm payment on blockchain
        await confirmPayPalPayment(
            capture.id,
            capture.custom_id, // preMintId stored in custom_id
            capture.payer.email_address, // Map to customer address
            parseFloat(capture.amount.value)
        );
    }
    
    res.status(200).send('OK');
});
```

## Smart Contract Functions

### For Merchants
```solidity
// Create pre-mint tokens for different payment providers
createPreMintToken(tokenId, productId, paymentProvider, price, metadata)

// Deactivate pre-mint tokens
deactivatePreMintToken(preMintId)

// View pre-mint token details
getPreMintToken(preMintId)
```

### For Payment Processors
```solidity
// Single payment confirmation
confirmPaymentAndMint(paymentIntentId, preMintId, customer, amount)

// Batch payment confirmations
batchConfirmPaymentsAndMint(paymentIntentIds[], preMintIds[], customers[], amounts[])

// Check if payment was already processed
isPaymentProcessed(paymentIntentId)
```

## Events Emitted

### Payment Confirmation Events
```solidity
event PaymentConfirmed(
    string indexed paymentIntentId,
    uint256 indexed preMintId,
    address indexed customer,
    string paymentProvider,
    uint256 amount
);

event NFTAutoMinted(
    uint256 indexed tokenId,
    address indexed customer,
    string paymentIntentId,
    string paymentProvider
);
```

## Security Features

1. **Duplicate Prevention**: Each payment intent ID can only be processed once
2. **Role-Based Access**: Only authorized payment processors can confirm payments
3. **Amount Verification**: Optional price verification to prevent underpayment
4. **Supply Limits**: Respects maximum supply constraints
5. **Reentrancy Protection**: Protected against reentrancy attacks

## Integration Checklist

- [ ] Deploy contract to Base network
- [ ] Add your payment processor address with `PAYMENT_PROCESSOR_ROLE`
- [ ] Create token types with `createToken()`
- [ ] Create pre-mint tokens for each product/payment provider
- [ ] Set up webhook handlers for payment confirmations
- [ ] Test with small amounts first
- [ ] Monitor events for successful minting

## Example Complete Flow

```javascript
// 1. Merchant creates pre-mint token
const preMintTx = await contract.createPreMintToken(
    1, "premium-nft", "apple_pay", ethers.utils.parseEther("0.05"), metadata
);

// 2. Customer pays via Apple Pay (frontend)
// 3. Apple Pay webhook triggers your backend
// 4. Your backend confirms payment on blockchain
const confirmTx = await contract.confirmPaymentAndMint(
    "pi_apple_123", 0, customerAddress, ethers.utils.parseEther("0.05")
);

// 5. NFT is automatically minted to customer! 🎉
```

This system provides seamless integration between traditional payment methods and NFT minting, with the payment processor handling all gas fees and blockchain interactions.


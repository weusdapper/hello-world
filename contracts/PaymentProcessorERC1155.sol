// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title PaymentProcessorERC1155
 * @dev ERC1155 contract designed for payment processor integration
 * Allows payment processors to mint NFTs directly to customers after purchase
 * Optimized for Base blockchain network with gas efficiency
 */
contract PaymentProcessorERC1155 is ERC1155, AccessControl, Pausable, ReentrancyGuard {
    using Strings for uint256;

    // Role definitions
    bytes32 public constant PAYMENT_PROCESSOR_ROLE = keccak256("PAYMENT_PROCESSOR_ROLE");
    bytes32 public constant MERCHANT_ROLE = keccak256("MERCHANT_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");

    // Contract metadata
    string public name;
    string public symbol;
    
    // Token tracking
    uint256 private _currentTokenId;
    mapping(uint256 => string) private _tokenURIs;
    mapping(uint256 => uint256) public tokenSupply;
    mapping(uint256 => uint256) public maxSupply;
    mapping(uint256 => address) public tokenCreator;
    mapping(uint256 => bool) public tokenExists;
    
    // Merchant and product tracking
    mapping(address => bool) public authorizedMerchants;
    mapping(uint256 => address) public tokenToMerchant;
    mapping(string => uint256) public productIdToTokenId;
    
    // Payment processor tracking
    mapping(address => bool) public authorizedProcessors;
    mapping(bytes32 => bool) public processedTransactions;
    
    // Pre-mint system for payment confirmations
    struct PreMintToken {
        uint256 tokenId;
        address merchant;
        string productId;
        string paymentProvider; // "apple_pay", "stripe", "paypal", etc.
        uint256 price; // Price in wei (for tracking)
        string metadata; // JSON metadata
        bool isActive;
        uint256 createdAt;
    }
    
    mapping(uint256 => PreMintToken) public preMintTokens;
    mapping(string => uint256) public paymentIntentToTokenId; // payment_intent_id -> tokenId
    uint256 private _preMintTokenCounter;
    
    // Events
    event TokenCreated(uint256 indexed tokenId, address indexed merchant, string productId, uint256 maxSupply);
    event NFTMintedForPurchase(
        uint256 indexed tokenId,
        address indexed customer,
        address indexed merchant,
        string transactionId,
        uint256 amount
    );
    event PaymentProcessorAdded(address indexed processor);
    event PaymentProcessorRemoved(address indexed processor);
    event MerchantAdded(address indexed merchant);
    event MerchantRemoved(address indexed merchant);
    
    // Pre-mint events
    event PreMintTokenCreated(
        uint256 indexed preMintId,
        uint256 indexed tokenId,
        address indexed merchant,
        string productId,
        string paymentProvider,
        uint256 price
    );
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

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _baseURI
    ) ERC1155(_baseURI) {
        name = _name;
        symbol = _symbol;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAYMENT_PROCESSOR_ROLE, msg.sender);
        _grantRole(MERCHANT_ROLE, msg.sender);
        _grantRole(URI_SETTER_ROLE, msg.sender);
    }

    /**
     * @dev Creates a new token type for a merchant's product
     * @param merchant Address of the merchant
     * @param productId Unique product identifier from merchant system
     * @param _maxSupply Maximum number of tokens that can be minted (0 for unlimited)
     * @param tokenURI Metadata URI for the token
     */
    function createToken(
        address merchant,
        string memory productId,
        uint256 _maxSupply,
        string memory tokenURI
    ) external onlyRole(MERCHANT_ROLE) returns (uint256) {
        require(merchant != address(0), "Invalid merchant address");
        require(bytes(productId).length > 0, "Product ID cannot be empty");
        require(productIdToTokenId[productId] == 0, "Product ID already exists");
        
        _currentTokenId++;
        uint256 tokenId = _currentTokenId;
        
        tokenExists[tokenId] = true;
        maxSupply[tokenId] = _maxSupply;
        tokenCreator[tokenId] = merchant;
        tokenToMerchant[tokenId] = merchant;
        productIdToTokenId[productId] = tokenId;
        _tokenURIs[tokenId] = tokenURI;
        
        emit TokenCreated(tokenId, merchant, productId, _maxSupply);
        return tokenId;
    }

    /**
     * @dev Main function for payment processors to mint NFTs after successful payment
     * @param customer Address to receive the NFT
     * @param tokenId Token ID to mint
     * @param amount Number of tokens to mint
     * @param transactionId Unique transaction identifier from payment processor
     * @param data Additional data for the mint
     */
    function mintForPurchase(
        address customer,
        uint256 tokenId,
        uint256 amount,
        string memory transactionId,
        bytes memory data
    ) external onlyRole(PAYMENT_PROCESSOR_ROLE) nonReentrant whenNotPaused {
        require(customer != address(0), "Invalid customer address");
        require(tokenExists[tokenId], "Token does not exist");
        require(amount > 0, "Amount must be greater than 0");
        require(bytes(transactionId).length > 0, "Transaction ID required");
        
        bytes32 txHash = keccak256(abi.encodePacked(transactionId, tokenId, customer));
        require(!processedTransactions[txHash], "Transaction already processed");
        
        // Check supply limits
        if (maxSupply[tokenId] > 0) {
            require(tokenSupply[tokenId] + amount <= maxSupply[tokenId], "Exceeds maximum supply");
        }
        
        // Mark transaction as processed
        processedTransactions[txHash] = true;
        tokenSupply[tokenId] += amount;
        
        // Mint the NFT to customer
        _mint(customer, tokenId, amount, data);
        
        emit NFTMintedForPurchase(
            tokenId,
            customer,
            tokenToMerchant[tokenId],
            transactionId,
            amount
        );
    }

    /**
     * @dev Internal function to mint NFT for purchase (used by batch function)
     */
    function _mintForPurchase(
        address customer,
        uint256 tokenId,
        uint256 amount,
        string memory transactionId
    ) internal {
        require(tokenExists[tokenId], "Token does not exist");
        require(amount > 0, "Amount must be greater than 0");
        require(bytes(transactionId).length > 0, "Transaction ID required");
        
        bytes32 txHash = keccak256(abi.encodePacked(transactionId, tokenId, customer));
        require(!processedTransactions[txHash], "Transaction already processed");
        
        // Check supply limits
        if (maxSupply[tokenId] > 0) {
            require(tokenSupply[tokenId] + amount <= maxSupply[tokenId], "Exceeds maximum supply");
        }
        
        // Mark transaction as processed
        processedTransactions[txHash] = true;
        tokenSupply[tokenId] += amount;
        
        // Mint the NFT to customer
        _mint(customer, tokenId, amount, "");
        
        emit NFTMintedForPurchase(
            tokenId,
            customer,
            msg.sender, // merchant/processor
            transactionId,
            amount
        );
    }

    /**
     * @dev Batch mint function for multiple purchases in one transaction
     * @param customers Array of customer addresses
     * @param tokenIds Array of token IDs
     * @param amounts Array of amounts to mint
     * @param transactionIds Array of transaction IDs
     */
    function batchMintForPurchases(
        address[] memory customers,
        uint256[] memory tokenIds,
        uint256[] memory amounts,
        string[] memory transactionIds
    ) external onlyRole(PAYMENT_PROCESSOR_ROLE) nonReentrant whenNotPaused {
        require(
            customers.length == tokenIds.length &&
            tokenIds.length == amounts.length &&
            amounts.length == transactionIds.length,
            "Array lengths must match"
        );
        
        for (uint256 i = 0; i < customers.length; i++) {
            _mintForPurchase(customers[i], tokenIds[i], amounts[i], transactionIds[i]);
        }
    }

    /**
     * @dev Add authorized payment processor
     */
    function addPaymentProcessor(address processor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(processor != address(0), "Invalid processor address");
        _grantRole(PAYMENT_PROCESSOR_ROLE, processor);
        authorizedProcessors[processor] = true;
        emit PaymentProcessorAdded(processor);
    }

    /**
     * @dev Remove payment processor authorization
     */
    function removePaymentProcessor(address processor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(PAYMENT_PROCESSOR_ROLE, processor);
        authorizedProcessors[processor] = false;
        emit PaymentProcessorRemoved(processor);
    }

    /**
     * @dev Add authorized merchant
     */
    function addMerchant(address merchant) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(merchant != address(0), "Invalid merchant address");
        _grantRole(MERCHANT_ROLE, merchant);
        authorizedMerchants[merchant] = true;
        emit MerchantAdded(merchant);
    }

    /**
     * @dev Remove merchant authorization
     */
    function removeMerchant(address merchant) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(MERCHANT_ROLE, merchant);
        authorizedMerchants[merchant] = false;
        emit MerchantRemoved(merchant);
    }

    /**
     * @dev Set URI for a specific token
     */
    function setTokenURI(uint256 tokenId, string memory tokenURI) 
        external 
        onlyRole(URI_SETTER_ROLE) 
    {
        require(tokenExists[tokenId], "Token does not exist");
        _tokenURIs[tokenId] = tokenURI;
    }

    /**
     * @dev Get URI for a specific token
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        require(tokenExists[tokenId], "Token does not exist");
        
        string memory tokenURI = _tokenURIs[tokenId];
        if (bytes(tokenURI).length > 0) {
            return tokenURI;
        }
        
        return string(abi.encodePacked(super.uri(tokenId), tokenId.toString()));
    }

    /**
     * @dev Set base URI for all tokens
     */
    function setURI(string memory newuri) external onlyRole(URI_SETTER_ROLE) {
        _setURI(newuri);
    }

    /**
     * @dev Get token information
     */
    function getTokenInfo(uint256 tokenId) external view returns (
        bool exists,
        uint256 currentSupply,
        uint256 maximumSupply,
        address creator,
        address merchant,
        string memory tokenURI
    ) {
        return (
            tokenExists[tokenId],
            tokenSupply[tokenId],
            maxSupply[tokenId],
            tokenCreator[tokenId],
            tokenToMerchant[tokenId],
            uri(tokenId)
        );
    }

    /**
     * @dev Check if transaction has been processed
     */
    function isTransactionProcessed(
        string memory transactionId,
        uint256 tokenId,
        address customer
    ) external view returns (bool) {
        bytes32 txHash = keccak256(abi.encodePacked(transactionId, tokenId, customer));
        return processedTransactions[txHash];
    }

    /**
     * @dev Emergency pause function
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause function
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Override required by Solidity for multiple inheritance
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ============ PRE-MINT SYSTEM FOR PAYMENT CONFIRMATIONS ============
    
    /**
     * @dev Create a pre-mint token that will be automatically minted upon payment confirmation
     * @param tokenId The token ID to mint (must exist)
     * @param productId Product identifier
     * @param paymentProvider Payment provider name ("apple_pay", "stripe", "paypal", etc.)
     * @param price Price in wei for tracking purposes
     * @param metadata JSON metadata for the NFT
     */
    function createPreMintToken(
        uint256 tokenId,
        string memory productId,
        string memory paymentProvider,
        uint256 price,
        string memory metadata
    ) external onlyRole(MERCHANT_ROLE) returns (uint256 preMintId) {
        require(tokenExists[tokenId], "Token does not exist");
        require(bytes(productId).length > 0, "Product ID required");
        require(bytes(paymentProvider).length > 0, "Payment provider required");
        
        preMintId = _preMintTokenCounter++;
        
        preMintTokens[preMintId] = PreMintToken({
            tokenId: tokenId,
            merchant: msg.sender,
            productId: productId,
            paymentProvider: paymentProvider,
            price: price,
            metadata: metadata,
            isActive: true,
            createdAt: block.timestamp
        });
        
        emit PreMintTokenCreated(
            preMintId,
            tokenId,
            msg.sender,
            productId,
            paymentProvider,
            price
        );
        
        return preMintId;
    }
    
    /**
     * @dev Confirm payment and automatically mint NFT to customer
     * Called by payment processors when payment is confirmed
     * @param paymentIntentId Unique payment intent ID from payment provider
     * @param preMintId The pre-mint token ID
     * @param customer Customer address to receive the NFT
     * @param amount Amount paid (for verification)
     */
    function confirmPaymentAndMint(
        string memory paymentIntentId,
        uint256 preMintId,
        address customer,
        uint256 amount
    ) external onlyRole(PAYMENT_PROCESSOR_ROLE) nonReentrant {
        _confirmPaymentAndMintInternal(paymentIntentId, preMintId, customer, amount);
    }
    
    /**
     * @dev Internal function to confirm payment and mint (used by batch)
     */
    function _confirmPaymentAndMintInternal(
        string memory paymentIntentId,
        uint256 preMintId,
        address customer,
        uint256 amount
    ) internal {
        require(customer != address(0), "Invalid customer address");
        require(bytes(paymentIntentId).length > 0, "Payment intent ID required");
        require(preMintTokens[preMintId].isActive, "Pre-mint token not active");
        require(paymentIntentToTokenId[paymentIntentId] == 0, "Payment already processed");
        
        PreMintToken storage preMint = preMintTokens[preMintId];
        
        // Verify payment amount matches expected price (optional check)
        if (preMint.price > 0) {
            require(amount >= preMint.price, "Insufficient payment amount");
        }
        
        // Check supply limits
        if (maxSupply[preMint.tokenId] > 0) {
            require(tokenSupply[preMint.tokenId] + 1 <= maxSupply[preMint.tokenId], "Exceeds maximum supply");
        }
        
        // Mark payment as processed
        paymentIntentToTokenId[paymentIntentId] = preMint.tokenId;
        tokenSupply[preMint.tokenId] += 1;
        
        // Mint the NFT to customer
        _mint(customer, preMint.tokenId, 1, "");
        
        // Emit events
        emit PaymentConfirmed(
            paymentIntentId,
            preMintId,
            customer,
            preMint.paymentProvider,
            amount
        );
        
        emit NFTAutoMinted(
            preMint.tokenId,
            customer,
            paymentIntentId,
            preMint.paymentProvider
        );
        
        emit NFTMintedForPurchase(
            preMint.tokenId,
            customer,
            preMint.merchant,
            paymentIntentId,
            1
        );
    }

    /**
     * @dev Batch confirm multiple payments and mint NFTs
     * @param paymentIntentIds Array of payment intent IDs
     * @param preMintIds Array of pre-mint token IDs
     * @param customers Array of customer addresses
     * @param amounts Array of payment amounts
     */
    function batchConfirmPaymentsAndMint(
        string[] memory paymentIntentIds,
        uint256[] memory preMintIds,
        address[] memory customers,
        uint256[] memory amounts
    ) external onlyRole(PAYMENT_PROCESSOR_ROLE) nonReentrant {
        require(
            paymentIntentIds.length == preMintIds.length &&
            preMintIds.length == customers.length &&
            customers.length == amounts.length,
            "Array lengths must match"
        );
        
        for (uint256 i = 0; i < paymentIntentIds.length; i++) {
            _confirmPaymentAndMintInternal(
                paymentIntentIds[i],
                preMintIds[i],
                customers[i],
                amounts[i]
            );
        }
    }
    
    /**
     * @dev Deactivate a pre-mint token (merchant only)
     * @param preMintId The pre-mint token ID to deactivate
     */
    function deactivatePreMintToken(uint256 preMintId) external {
        require(preMintTokens[preMintId].merchant == msg.sender || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), 
                "Only merchant or admin can deactivate");
        preMintTokens[preMintId].isActive = false;
    }
    
    /**
     * @dev Get pre-mint token details
     * @param preMintId The pre-mint token ID
     */
    function getPreMintToken(uint256 preMintId) external view returns (PreMintToken memory) {
        return preMintTokens[preMintId];
    }
    
    /**
     * @dev Check if payment intent has been processed
     * @param paymentIntentId The payment intent ID to check
     */
    function isPaymentProcessed(string memory paymentIntentId) external view returns (bool) {
        return paymentIntentToTokenId[paymentIntentId] != 0;
    }
    
    /**
     * @dev Get current pre-mint token counter
     */
    function getCurrentPreMintId() external view returns (uint256) {
        return _preMintTokenCounter;
    }

    /**
     * @dev Hook that is called before any token transfer
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override whenNotPaused {
        super._update(from, to, ids, values);
    }
}

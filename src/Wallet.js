
import { ethers } from 'ethers';

class Wallet {
  constructor() {
    this.wallet = null;
    this.provider = null;
  }

  /**
   * Initialize the wallet with a provider and private key
   * @param {ethers.Provider} provider - Ethers provider
   * @returns {boolean} - Whether initialization was successful
   */
  initialize(provider) {
    this.provider = provider;
    
    if (process.env.PRIVATE_KEY) {
      try {
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        return true;
      } catch (error) {
        console.error('Failed to initialize wallet:', error.message);
        return false;
      }
    }
    
    return false;
  }

  /**
   * Check if the wallet is initialized
   * @returns {boolean} - Whether the wallet is initialized
   */
  isInitialized() {
    return this.wallet !== null;
  }

  /**
   * Get the wallet instance
   * @returns {ethers.Wallet|null} - The wallet instance or null if not initialized
   */
  getWallet() {
    return this.wallet;
  }

  /**
   * Get the wallet's address
   * @returns {string|null} - The wallet's address or null if not initialized
   */
  getAddress() {
    return this.wallet ? this.wallet.address : null;
  }
}

// Export a singleton instance
const walletInstance = new Wallet();
export default walletInstance;

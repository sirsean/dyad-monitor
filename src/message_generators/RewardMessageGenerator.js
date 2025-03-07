
import { ethers } from 'ethers';
import NoteMessageGenerator from './NoteMessageGenerator.js';
import { formatNumber, fetchRewards } from '../utils.js';
import Pricer from '../Pricer.js';

/**
 * Generates reward-related messages for a note
 */
class RewardMessageGenerator extends NoteMessageGenerator {
  /**
   * @param {Object} options
   * @param {Object} options.dyadLpStakingFactory - The staking factory contract
   * @param {Object} options.keroseneVault - The kerosene vault contract
   * @param {Object} options.provider - The ethers provider
   * @param {Object} options.wallet - The wallet instance (optional)
   * @param {boolean} options.shouldClaim - Whether to actually claim rewards (default: true)
   */
  constructor({ dyadLpStakingFactory, keroseneVault, provider, wallet = null, shouldClaim = true }) {
    super();
    this.dyadLpStakingFactory = dyadLpStakingFactory;
    this.keroseneVault = keroseneVault;
    this.provider = provider;
    this.wallet = wallet;
    this.shouldClaim = shouldClaim;
  }

  /**
   * Generate reward messages for a note
   * @param {string} noteId - The note ID
   * @returns {Promise<string[]>} Array of message lines
   */
  async generate(noteId) {
    const messages = [];
    
    const pricer = new Pricer();
    const mp = await pricer.getPrice('KEROSENE');
    const dv = await this.keroseneVault.assetPrice().then(r => parseFloat(r) * 10 ** -8);
    
    const { claimable, claimableMp, percentage, gas, usdGasCost } = await this.estimateClaim(noteId);
    const claimableDv = parseFloat(claimable) * 10 ** -18 * dv;

    if (claimable > 0) {
      if (percentage && percentage < 0.01) {
        if (this.shouldClaim) {
          messages.push(`Claiming ${formatNumber(ethers.formatUnits(claimable, 18))} KERO ($${formatNumber(claimableMp, 2)}/$${formatNumber(claimableDv, 2)}) for ${ethers.formatEther(gas)} ETH ($${formatNumber(usdGasCost, 2)})`);
          if (this.wallet && this.wallet.isInitialized()) {
            await this.claim(noteId);
          }
        } else {
          messages.push(`Claimable: ${formatNumber(ethers.formatUnits(claimable, 18))} KERO ($${formatNumber(claimableMp, 2)}/$${formatNumber(claimableDv, 2)}), would cost ${ethers.formatEther(gas)} ETH ($${formatNumber(usdGasCost, 2)}) gas (claim not executed)`);
        }
      } else if (gas) {
        messages.push(`Claimable: ${formatNumber(ethers.formatUnits(claimable, 18))} KERO ($${formatNumber(claimableMp, 2)}/$${formatNumber(claimableDv, 2)}), not worth ${ethers.formatEther(gas)} ETH ($${formatNumber(usdGasCost, 2)}) gas`);
      } else {
        messages.push(`Claimable: ${formatNumber(ethers.formatUnits(claimable, 18))} KERO ($${formatNumber(claimableMp, 2)}/$${formatNumber(claimableDv, 2)}), but gas cannot be estimated`);
      }
    }
    
    return messages;
  }

  /**
   * Estimate claiming rewards
   * @param {string} noteId - The note ID
   * @returns {Promise<Object>} Claim estimation
   */
  async estimateClaim(noteId) {
    const pricer = new Pricer();
    const rewards = await fetchRewards(noteId);
    const claimed = await this.dyadLpStakingFactory.noteIdToTotalClaimed(noteId);

    const amount = rewards.amount;
    const proof = rewards.proof;

    const claimable = BigInt(amount) - claimed;
    const mp = await pricer.getPrice("KEROSENE");
    const claimableMp = parseFloat(claimable) * 10 ** -18 * mp;

    if (claimable == 0) {
      return {
        claimable,
        claimableMp,
      };
    } else if (this.wallet && this.wallet.isInitialized()) {
      const dyadLpStakingFactoryWriter = this.dyadLpStakingFactory.connect(this.wallet.getWallet());
      try {
        const gasEstimate = await dyadLpStakingFactoryWriter.claimToVault.estimateGas(
          noteId,
          amount,
          proof,
        );
        const gasPrice = await this.provider.getFeeData().then((d) => d.gasPrice);
        const gas = gasEstimate * gasPrice;
        const ethPrice = await pricer.getPrice("ETH");
        const usdGasCost = parseFloat(gas) * 10 ** -18 * ethPrice;
        const percentage = usdGasCost / claimableMp;

        return {
          claimable,
          claimableMp,
          gas,
          usdGasCost,
          percentage,
        };
      } catch (err) {
        console.error(err);
        return {
          claimable,
          claimableMp,
        };
      }
    } else {
      return {
        claimable,
        claimableMp,
      };
    }
  }

  /**
   * Claim rewards to vault
   * @param {string} noteId - The note ID
   * @returns {Promise<void>}
   */
  async claim(noteId) {
    if (!this.wallet || !this.wallet.isInitialized()) {
      throw new Error('Wallet not initialized');
    }

    const rewards = await fetchRewards(noteId);
    const amount = rewards.amount;
    const proof = rewards.proof;

    const dyadLpStakingFactoryWriter = this.dyadLpStakingFactory.connect(this.wallet.getWallet());
    await dyadLpStakingFactoryWriter.claimToVault(noteId, amount, proof)
      .then(tx => tx.wait());
  }
}

export default RewardMessageGenerator;

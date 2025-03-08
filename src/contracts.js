
import { ethers } from 'ethers';
import { openContract } from './utils.js';
import { ADDRESSES, VAULT_ADDRESSES } from './constants.js';

// Define contract variables
let vaultManager;
let keroseneVault;
let dyadLpStakingFactory;
let dyad;

/**
 * Initialize all blockchain contracts
 * @param {ethers.Provider} provider - The ethers provider
 * @returns {Object} - The initialized contracts
 */
async function initialize(provider) {
  vaultManager = await openContract(ADDRESSES.VAULT_MANAGER, 'abi/VaultManagerV5.json', provider);
  keroseneVault = await openContract(ADDRESSES.KEROSENE_VAULT, 'abi/KeroseneVault.json', provider);
  dyadLpStakingFactory = await openContract(ADDRESSES.DYAD_LP_STAKING_FACTORY, 'abi/DyadLPStakingFactory.json', provider);
  dyad = await openContract(ADDRESSES.DYAD, 'abi/Dyad.json', provider);
  
  return {
    vaultManager,
    keroseneVault,
    dyadLpStakingFactory,
    dyad
  };
}

/**
 * Get a vault contract by asset name
 * @param {string} asset - The asset name (e.g., 'KEROSENE', 'WETH')
 * @param {ethers.Provider} provider - The ethers provider
 * @returns {Promise<ethers.Contract>} - The vault contract
 */
async function getVaultByAsset(asset, provider) {
  const vaultAddress = VAULT_ADDRESSES[asset];
  if (!vaultAddress) {
    throw new Error(`Unknown asset: ${asset}. Available assets: ${Object.keys(VAULT_ADDRESSES).join(', ')}`);
  }
  
  return await openContract(vaultAddress, 'abi/Vault.json', provider);
}

/**
 * Get all initialized contracts
 * @returns {Object} - All contracts
 */
function getContracts() {
  if (!vaultManager || !keroseneVault || !dyadLpStakingFactory || !dyad) {
    throw new Error('Contracts not initialized. Call initialize() first.');
  }
  
  return {
    vaultManager,
    keroseneVault,
    dyadLpStakingFactory,
    dyad
  };
}

export {
  initialize,
  getContracts,
  getVaultByAsset
};

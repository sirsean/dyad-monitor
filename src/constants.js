import { ethers } from 'ethers';

// Contract addresses
export const ADDRESSES = {
  VAULT_MANAGER: '0xB62bdb1A6AC97A9B70957DD35357311e8859f0d7',
  KEROSENE_VAULT: '0x4808e4CC6a2Ba764778A0351E1Be198494aF0b43',
  DYAD_LP_STAKING_FACTORY: '0xD19DCbB8B82805d779a6A2182d8F4355275CC30a',
  DYAD: '0xFd03723a9A3AbE0562451496a9a394D2C4bad4ab',
};

// Vault addresses mapping
export const VAULT_ADDRESSES = {
  'KEROSENE': ADDRESSES.KEROSENE_VAULT,
  'WETH': '0x4fde0131694Ae08C549118c595923CE0b42f8299',
};

// LP tokens mapping
export const LP_TOKENS = {
  '0xa969cFCd9e583edb8c8B270Dc8CaFB33d6Cf662D': 'DYAD/wM',
  '0x1507bf3F8712c496fA4679a4bA827F633979dBa4': 'DYAD/USDC',
};

// CR constants
export const TARGET_CR = 2.75;
export const LOWER_CR = 2.5;
export const UPPER_CR = 3.0;
export const MIN_CR = 2.0; //Added MIN_CR constant


// Format a number to a specific number of decimal places
export const formatNumber = (num, decimals = 2) => {
  return Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

export default {
  ADDRESSES,
  VAULT_ADDRESSES,
  LP_TOKENS,
  TARGET_CR,
  LOWER_CR,
  UPPER_CR,
  MIN_CR,
  formatNumber,
};
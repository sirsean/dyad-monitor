import { ethers } from 'ethers';
import { readFile } from 'fs/promises';

/**
 * Fetch rewards data for a specific note ID
 * @param {string} noteId - The note ID to fetch rewards for
 * @returns {Promise<Object>} - Rewards data including amount and proof
 */
export async function fetchRewards(noteId) {
  return fetch(`https://api.dyadstable.xyz/api/rewards/${noteId}`)
    .then(response => response.json());
}

/**
 * Fetch yield data for a specific note ID
 * @param {string} noteId - The note ID to fetch yield for
 * @returns {Promise<Object>} - Yield data including LP positions and APR
 */
export async function fetchYield(noteId) {
  return fetch(`https://api.dyadstable.xyz/api/yields/${noteId}`)
    .then(response => response.json());
}

/**
 * Format a number with specified decimal places
 * @param {string|number} numberString - The number to format
 * @param {number} decimalPlaces - Number of decimal places (default: 0)
 * @returns {number} - Formatted number
 */
export function formatNumber(numberString, decimalPlaces = 0) {
  const number = parseFloat(numberString);
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(number * factor) / factor;
}

/**
 * Open a contract with the given address and ABI
 * @param {string} address - Contract address
 * @param {string} abiFilename - Path to the ABI JSON file
 * @param {ethers.Provider} provider - Ethers provider
 * @returns {Promise<ethers.Contract>} - Ethers contract instance
 */
export async function openContract(address, abiFilename, provider) {
  return readFile(abiFilename, 'utf8')
    .then(JSON.parse)
    .then(abi => new ethers.Contract(address, abi, provider));
}

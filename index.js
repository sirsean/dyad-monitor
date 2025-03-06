// utils.js
import { ethers } from 'ethers';

export async function openContract(address, abiFilename, provider) {
  const abi = await import(`../${abiFilename}`); // Adjust path as needed
  return new ethers.Contract(address, abi.default, provider); // Assuming abi is a default export. Adjust if not.
}

export async function fetchRewards(noteId) {
  return fetch(`https://api.dyadstable.xyz/api/rewards/${noteId}`)
    .then(response => response.json());
}

export async function fetchYield(noteId) {
  return fetch(`https://api.dyadstable.xyz/api/yields/${noteId}`)
    .then(response => response.json());
}

export function formatNumber(numberString, decimalPlaces = 0) {
  const number = parseFloat(numberString);
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(number * factor) / factor;
}


// index.js
import { ethers } from 'ethers';
import { readFile } from 'fs/promises';
import { Command } from 'commander';
import LiquidationMonitor from './src/LiquidationMonitor.js';
import GraphNote from './src/GraphNote.js';
import DailyCheckProcessor from './src/DailyCheckProcessor.js';
import ExecutionSchedule from './src/ExecutionSchedule.js';
import Pricer from './src/Pricer.js';
import discordClient from './src/Discord.js';
import * as utils from './utils.js'; // Import the utils module

const VAULT_MANAGER_ADDRESS = '0xB62bdb1A6AC97A9B70957DD35357311e8859f0d7';
const KEROSENE_VAULT_ADDRESS = '0x4808e4CC6a2Ba764778A0351E1Be198494aF0b43';
const DYAD_LP_STAKING_FACTORY_ADDRESS = '0xD19DCbB8B82805d779a6A2182d8F4355275CC30a';
const DYAD_ADDRESS = '0xFd03723a9A3AbE0562451496a9a394D2C4bad4ab';
const LP_TOKENS = {
  '0xa969cFCd9e583edb8c8B270Dc8CaFB33d6Cf662D': 'DYAD/wM',
  '0x1507bf3F8712c496fA4679a4bA827F633979dBa4': 'DYAD/USDC',
}

const VAULT_ADDRESSES = {
  'KEROSENE': KEROSENE_VAULT_ADDRESS,
  'WETH': '0x4fde0131694Ae08C549118c595923CE0b42f8299',
}

const LOWER_CR = 2.5;
const TARGET_CR = 2.75;
const UPPER_CR = 3.0;
const MIN_CR = 2.0;

const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_RPC_URL);

let wallet;
let vaultManager;
let keroseneVault;
let dyadLpStakingFactory;
let dyad;

// async function openContract(address, abiFilename) { // Removed - Now in utils.js
//   return readFile(abiFilename, 'utf8')
//     .then(JSON.parse)
//     .then(abi => new ethers.Contract(address, abi, provider));
// }

async function initializeWallet() {
  if (process.env.PRIVATE_KEY) {
    wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  }
}

async function initializeContracts() {
  vaultManager = await utils.openContract(VAULT_MANAGER_ADDRESS, 'abi/VaultManagerV5.json', provider);
  keroseneVault = await utils.openContract(KEROSENE_VAULT_ADDRESS, 'abi/KeroseneVault.json', provider);
  dyadLpStakingFactory = await utils.openContract(DYAD_LP_STAKING_FACTORY_ADDRESS, 'abi/DyadLPStakingFactory.json', provider);
  dyad = await utils.openContract(DYAD_ADDRESS, 'abi/Dyad.json', provider);
}

// Discord client is initialized in the Discord module

// Use the discordClient notify method instead of direct implementation
const notify = message => discordClient.notify(message);

// async function fetchRewards(noteId) { // Removed - Now in utils.js
//   return fetch(`https://api.dyadstable.xyz/api/rewards/${noteId}`)
//     .then(response => response.json());
// }

// async function fetchYield(noteId) { // Removed - Now in utils.js
//   return fetch(`https://api.dyadstable.xyz/api/yields/${noteId}`)
//     .then(response => response.json());
// }

// function formatNumber(numberString, decimalPlaces = 0) { // Removed - Now in utils.js
//   const number = parseFloat(numberString);
//   const factor = Math.pow(10, decimalPlaces);
//   return Math.round(number * factor) / factor;
// }

async function estimateClaim() {
  if (!wallet) {
    throw new Error("Wallet not initialized");
  }

  const pricer = new Pricer();

  const noteId = process.env.NOTE_IDS.split(",")[0];
  const rewards = await utils.fetchRewards(noteId);
  const claimed = await dyadLpStakingFactory.noteIdToTotalClaimed(noteId);

  const amount = rewards.amount;
  const proof = rewards.proof;

  const claimable = BigInt(amount) - claimed;
  const mp = await pricer.getPrice("KEROSENE");
  const claimableMp = parseFloat(claimable) * 10 ** -18 * mp;
  const ethPrice = await pricer.getPrice("ETH");

  // Estimate gas for the claim
  if (claimable == 0) {
    return {
      claimable,
      claimableMp,
    };
  } else {
    const dyadLpStakingFactoryWriter = dyadLpStakingFactory.connect(wallet);
    try {
      const gasEstimate =
        await dyadLpStakingFactoryWriter.claimToVault.estimateGas(
          noteId,
          amount,
          proof,
        );
      const gasPrice = await provider.getFeeData().then((d) => d.gasPrice);
      const gas = gasEstimate * gasPrice;
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
  }
}

async function claim() {
  if (!wallet) {
    throw new Error('Wallet not initialized');
  }

  const noteId = process.env.NOTE_IDS.split(',')[0];
  const rewards = await utils.fetchRewards(noteId);

  const amount = rewards.amount;
  const proof = rewards.proof;

  const dyadLpStakingFactoryWriter = dyadLpStakingFactory.connect(wallet);
  await dyadLpStakingFactoryWriter.claimToVault(noteId, amount, proof)
    .then(tx => tx.wait());
}

async function lookupRisk(noteId) {
  const cr = await vaultManager.collatRatio(noteId);
  const crFloat = utils.formatNumber(ethers.formatUnits(cr, 18), 3);

  const totalValue = await vaultManager.getTotalValue(noteId);
  const mintedDyad = await dyad.mintedDyad(noteId);
  const targetDebt = parseFloat(ethers.formatUnits(totalValue, 18)) / TARGET_CR;

  const dyadToBurn = parseFloat(ethers.formatUnits(mintedDyad, 18)) - targetDebt;
  const dyadToMint = targetDebt - parseFloat(ethers.formatUnits(mintedDyad, 18));

  return {
    cr,
    shouldMint: crFloat > UPPER_CR,
    dyadToMint,
    shouldBurn: crFloat < LOWER_CR,
    dyadToBurn,
  }
}

async function noteMessages(noteId) {
  const messages = [];

  const pricer = new Pricer();

  const mp = await pricer.getPrice('KEROSENE');
  const dv = await keroseneVault.assetPrice().then(r => parseFloat(r) * 10 ** -8);

  messages.push(`Note: ${noteId}`);

  const { cr, shouldMint, dyadToMint, shouldBurn, dyadToBurn } = await lookupRisk(noteId);
  const crFloat = utils.formatNumber(ethers.formatUnits(cr, 18), 3);
  messages.push(`CR: ${crFloat}`);

  const y = await utils.fetchYield(noteId);

  const noteXp = y[Object.keys(y)[0]]?.noteXp;
  messages.push(`XP: ${utils.formatNumber(noteXp, 2)}`);

  const { claimable, claimableMp, percentage, gas, usdGasCost } = await estimateClaim();

  const claimableDv = parseFloat(claimable) * 10 ** -18 * dv;

  if (claimable > 0) {
    if (percentage < 0.01) {
      messages.push(`Claiming ${utils.formatNumber(ethers.formatUnits(claimable, 18))} KERO ($${utils.formatNumber(claimableMp, 2)}/$${utils.formatNumber(claimableDv, 2)}) for ${ethers.formatEther(gas)} ETH ($${utils.formatNumber(usdGasCost, 2)})`);
      await claim();
    } else if (gas) {
      messages.push(`Claimable: ${utils.formatNumber(ethers.formatUnits(claimable, 18))} KERO ($${utils.formatNumber(claimableMp, 2)}/$${utils.formatNumber(claimableDv, 2)}), not worth ${ethers.formatEther(gas)} ETH ($${utils.formatNumber(usdGasCost, 2)}) gas`);
    } else {
       messages.push(`Claimable: ${utils.formatNumber(ethers.formatUnits(claimable, 18))} KERO ($${utils.formatNumber(claimableMp, 2)}/$${utils.formatNumber(claimableDv, 2)}), but gas cannot be estimated`);
    }
  }

  for (const key in y) {
    const vault = y[key];
    if (parseFloat(vault.noteLiquidity) > 0) {
      messages.push('---');
      messages.push(`LP: ${LP_TOKENS[vault.lpToken]}`);
      messages.push(`Liquidity: ${utils.formatNumber(vault.noteLiquidity)}`);

      const keroPerWeek = parseFloat(vault.kerosenePerYear) / 52;
      messages.push(`KERO/week: ${utils.formatNumber(keroPerWeek)} ($${utils.formatNumber(keroPerWeek * mp, 2)}/$${utils.formatNumber(keroPerWeek * dv, 2)})`);

      const mpApr = parseFloat(vault.kerosenePerYear) * mp / parseFloat(vault.noteLiquidity);
      messages.push(`MP-APR: ${utils.formatNumber(mpApr * 100, 2)}%`);

      const dvApr = parseFloat(vault.kerosenePerYear) * dv / parseFloat(vault.noteLiquidity);
      messages.push(`DV-APR: ${utils.formatNumber(dvApr * 100, 2)}%`);
    }
  }

  if (shouldBurn) {
    messages.push('---');
    messages.push(`Recommendation: Burn ${utils.formatNumber(dyadToBurn, 0)} DYAD`);
  } else if (shouldMint) {
    messages.push('---');
    messages.push(`Recommendation: Mint ${utils.formatNumber(dyadToMint, 0)} DYAD`);
  }

  return messages.join('\n');
}

async function monitorCommand() {
  const noteIds = process.env.NOTE_IDS.split(',');
  const messages = [];
  for (const noteId of noteIds) {
    await noteMessages(noteId)
      .then(message => messages.push(message))
      .catch(err => {
        console.error(err);
        messages.push(`Failed to fetch note ${noteId}: ${err}`);
      });
  }
  const liquidations = await GraphNote.search()
    .then(notes => notes.filter(note => note.collatRatio < ethers.parseUnits('1.5', 18)))
    .then(notes => notes.filter(note => note.dyad >= ethers.parseUnits('100', 18)));
  if (liquidations.length > 0) {
    messages.push('Liquidations:');
    for (const note of liquidations) {
      const liquidationMessages = [note.toString()];
      const vaults = await vaultManager.getVaults(note.id);
      for (const vaultAddress of vaults) {
        const vault = await utils.openContract(vaultAddress, 'abi/Vault.json', provider);
        const assetAddress = await vault.asset();
        const asset = await utils.openContract(assetAddress, 'abi/ERC20.json', provider);
        const symbol = await asset.symbol();
        const usdValue = await vault.getUsdValue(note.id);
        liquidationMessages.push(`  ${symbol}: ${ethers.formatUnits(usdValue, 18)}`);
      }
      messages.push(liquidationMessages.join('\n'));
    }
  }
  await notify(messages.join('\n===\n'));
}

async function checkNote(noteId) {
  const cr = await vaultManager.collatRatio(noteId);
  const crFloat = utils.formatNumber(ethers.formatUnits(cr, 18), 3);
  console.log(`Collateral Ratio for Note ${noteId}: ${crFloat}`);

  const mintedDyad = await dyad.mintedDyad(noteId);
  console.log(`Minted DYAD: $${ethers.formatUnits(mintedDyad, 18)}`);

  const vaults = await vaultManager.getVaults(noteId);
  vaults.forEach(async (vaultAddress) => {
    const vault = await utils.openContract(vaultAddress, 'abi/Vault.json', provider);
    const assetAddress = await vault.asset();
    const asset = await utils.openContract(assetAddress, 'abi/ERC20.json', provider);
    const symbol = await asset.symbol();
    const usdValue = await vault.getUsdValue(noteId);
    console.log(`${symbol}: $${utils.formatNumber(ethers.formatUnits(usdValue, 18), 2)}`);
  });
}

async function checkRiskCommand(noteId) {
  const { cr, shouldMint, dyadToMint, shouldBurn, dyadToBurn } = await lookupRisk(noteId);
  const crFloat = utils.formatNumber(ethers.formatUnits(cr, 18), 3);

  console.log(`Note: ${noteId}`);
  console.log(`Collateral Ratio: ${crFloat}`);

  if (dyadToMint > 0) {
    console.log(`Mint to target: ${dyadToMint}`);
  }
  if (dyadToBurn > 0) {
    console.log(`Burn to target: ${dyadToBurn}`);
  }

  if (shouldBurn) {
    console.log(`Recommendation: Burn ${utils.formatNumber(dyadToBurn, 0)} DYAD`);
  } else if (shouldMint) {
    console.log(`Recommendation: Mint ${utils.formatNumber(dyadToMint, 0)} DYAD`);
  } else {
    console.log('Recommendation: No action needed');
  }
}

async function mintCommand(noteId, amount) {
  if (!wallet) {
    throw new Error("Wallet not initialized");
  }

  // Parse amount to BigInt with 18 decimals
  const dyadAmount = ethers.parseUnits(amount.toString(), 18);

  // Get current collateral ratio
  const currentCR = await vaultManager.collatRatio(noteId);
  const currentCRFloat = utils.formatNumber(ethers.formatUnits(currentCR, 18), 3);
  console.log(`Note: ${noteId}`);
  console.log(`Before Mint - Collateral Ratio: ${currentCRFloat}`);

  // Calculate what CR would be after mint
  const totalValue = await vaultManager.getTotalValue(noteId);
  const mintedDyad = await dyad.mintedDyad(noteId);
  const newDyadTotal = mintedDyad + dyadAmount;

  // CR = totalValue / totalDyad
  const newCR = totalValue * BigInt(10**18) / newDyadTotal;
  const newCRFloat = utils.formatNumber(ethers.formatUnits(newCR, 18), 3);

  console.log(`After Mint - Estimated Collateral Ratio: ${newCRFloat}`);

  // Check if CR would go below MIN_CR
  if (newCRFloat < MIN_CR) {
    console.error(`Cannot mint: Collateral ratio ${newCRFloat} would go below ${MIN_CR}`);
    return;
  }

  try {
    // Connect wallet to vault manager
    const vaultManagerWriter = vaultManager.connect(wallet);

    // Execute mint operation
    console.log(`Minting ${amount} DYAD to note ${noteId}`);
    const tx = await vaultManagerWriter.mintDyad(noteId, dyadAmount, wallet.address);

    // Wait for transaction to complete
    const receipt = await tx.wait();
    console.log(`Transaction successful: ${receipt.hash}`);

    // Get new collateral ratio
    const finalCR = await vaultManager.collatRatio(noteId);
    const finalCRFloat = utils.formatNumber(ethers.formatUnits(finalCR, 18), 3);
    console.log(`Final Collateral Ratio: ${finalCRFloat}`);
  } catch (error) {
    console.error(`Error minting DYAD: ${error.message}`);
  }
}

async function burnCommand(noteId, amount) {
  if (!wallet) {
    throw new Error("Wallet not initialized");
  }

  // Parse amount to BigInt with 18 decimals
  const dyadAmount = ethers.parseUnits(amount.toString(), 18);

  // Check wallet DYAD balance first
  const dyadBalance = await dyad.balanceOf(wallet.address);
  if (dyadBalance < dyadAmount) {
    console.error(`Insufficient DYAD balance. You have ${ethers.formatUnits(dyadBalance, 18)} DYAD but trying to burn ${amount} DYAD.`);
    console.log(`Use the 'mint' command first to mint more DYAD to your wallet if needed.`);
    return;
  }

  // Get current collateral ratio
  const currentCR = await vaultManager.collatRatio(noteId);
  const currentCRFloat = utils.formatNumber(ethers.formatUnits(currentCR, 18), 3);
  console.log(`Note: ${noteId}`);
  console.log(`Before Burn - Collateral Ratio: ${currentCRFloat}`);

  // Get current DYAD minted
  const mintedDyad = await dyad.mintedDyad(noteId);

  // Check if there's enough DYAD minted to burn
  if (dyadAmount > mintedDyad) {
    console.error(`Cannot burn ${amount} DYAD: Note only has ${ethers.formatUnits(mintedDyad, 18)} DYAD minted`);
    return;
  }

  // Calculate what CR would be after burn
  const totalValue = await vaultManager.getTotalValue(noteId);
  const newDyadTotal = mintedDyad - dyadAmount;

  // Avoid division by zero if burning all DYAD
  let newCRFloat;
  if (newDyadTotal === BigInt(0)) {
    newCRFloat = "∞";
  } else {
    const newCR = totalValue * BigInt(10**18) / newDyadTotal;
    newCRFloat = utils.formatNumber(ethers.formatUnits(newCR, 18), 3);
  }

  console.log(`After Burn - Estimated Collateral Ratio: ${newCRFloat}`);

  try {
    // Approve VaultManager to spend DYAD if needed
    const currentAllowance = await dyad.allowance(wallet.address, VAULT_MANAGER_ADDRESS);
    if (currentAllowance < dyadAmount) {
      console.log(`Approving DYAD transfer...`);
      const dyadWriter = dyad.connect(wallet);
      const approveTx = await dyadWriter.approve(VAULT_MANAGER_ADDRESS, dyadAmount);
      await approveTx.wait();
    }

    // Connect wallet to vault manager
    const vaultManagerWriter = vaultManager.connect(wallet);

    // Execute burn operation
    console.log(`Burning ${amount} DYAD from note ${noteId}`);
    const tx = await vaultManagerWriter.burnDyad(noteId, dyadAmount);

    // Wait for transaction to complete
    const receipt = await tx.wait();
    console.log(`Transaction successful: ${receipt.hash}`);

    // Get new collateral ratio
    const finalCR = await vaultManager.collatRatio(noteId);
    const finalCRFloat = utils.formatNumber(ethers.formatUnits(finalCR, 18), 3);
    console.log(`Final Collateral Ratio: ${finalCRFloat}`);
  } catch (error) {
    console.error(`Error burning DYAD: ${error.message}`);
  }
}

async function balanceCommand() {
  if (!wallet) {
    throw new Error("Wallet not initialized");
  }

  try {
    // Get wallet's DYAD balance
    const walletBalance = await dyad.balanceOf(wallet.address);
    console.log(`Wallet DYAD Balance: ${ethers.formatUnits(walletBalance, 18)} DYAD`);

    // Get all configured note IDs
    const noteIds = process.env.NOTE_IDS.split(',');
    console.log('\nMinted DYAD by Note:');

    // Fetch minted DYAD for each note
    for (const noteId of noteIds) {
      const mintedAmount = await dyad.mintedDyad(noteId);
      console.log(`Note ${noteId}: ${ethers.formatUnits(mintedAmount, 18)} DYAD`);

      // Calculate the collateral ratio for context
      const cr = await vaultManager.collatRatio(noteId);
      const crFloat = utils.formatNumber(ethers.formatUnits(cr, 18), 3);
      console.log(`  Collateral Ratio: ${crFloat}`);
    }
  } catch (error) {
    console.error(`Error fetching DYAD balances: ${error.message}`);
  }
}

async function checkClaimableCommand() {
  const pricer = new Pricer();

  // Get token prices for calculations
  const mpPrice = await pricer.getPrice("KEROSENE");
  const dvPrice = await keroseneVault.assetPrice().then(r => parseFloat(r) * 10 ** -8);

  // Get note ID from environment variable
  const noteId = process.env.NOTE_IDS.split(",")[0];

  // Fetch raw rewards data from API
  const rewards = await utils.fetchRewards(noteId);
  console.log(`Note ID: ${noteId}`);
  console.log(`Raw rewards amount: ${ethers.formatUnits(rewards.amount, 18)} KERO`);

  // Get the amount already claimed from the contract
  const claimed = await dyadLpStakingFactory.noteIdToTotalClaimed(noteId);
  console.log(`Amount already claimed: ${ethers.formatUnits(claimed, 18)} KERO`);

  // Calculate claimable amount
  const claimable = BigInt(rewards.amount) - claimed;
  const claimableFormatted = ethers.formatUnits(claimable, 18);

  // Calculate USD values based on different price sources
  const mpValueUSD = parseFloat(claimableFormatted) * mpPrice;
  const dvValueUSD = parseFloat(claimableFormatted) * dvPrice;

  console.log(`\nClaimable amount: ${claimableFormatted} KERO`);
  console.log(`MP value: $${utils.formatNumber(mpValueUSD, 2)}`);
  console.log(`DV value: $${utils.formatNumber(dvValueUSD, 2)}`);

  // If there's anything to claim, estimate gas costs
  if (claimable > 0 && wallet) {
    try {
      const dyadLpStakingFactoryWriter = dyadLpStakingFactory.connect(wallet);
      const gasEstimate = await dyadLpStakingFactoryWriter.claimToVault.estimateGas(
        noteId,
        rewards.amount,
        rewards.proof
      );
      const gasPrice = await provider.getFeeData().then((d) => d.gasPrice);
      const gas = gasEstimate * gasPrice;
      const ethPrice = await pricer.getPrice("ETH");
      const usdGasCost = parseFloat(gas) * 10 ** -18 * ethPrice;
      const percentage = usdGasCost / mpValueUSD;

      console.log(`\nGas estimate: ${ethers.formatEther(gas)} ETH ($${utils.formatNumber(usdGasCost, 2)})`);
      console.log(`Gas cost as percentage of claim value: ${utils.formatNumber(percentage * 100, 2)}%`);

      if (percentage < 0.01) {
        console.log(`\nRecommendation: Claiming is economical (gas < 1% of claim value)`);
      } else {
        console.log(`\nRecommendation: Consider waiting to claim (gas is ${utils.formatNumber(percentage * 100, 2)}% of claim value)`);
      }
    } catch (err) {
      console.error('Error estimating gas:', err.message);
      console.log('\nUnable to estimate gas costs for claiming.');
    }
  } else if (claimable <= 0) {
    console.log('\nNothing to claim at this time.');
  } else {
    console.log('\nWallet not initialized, cannot estimate gas costs.');
  }
}

async function watchCommand() {
  console.log('Watching for liquidatable notes and running daily checks...');
  console.log('Press Ctrl+C to stop');

  let blockProcessor = null;
  let dailyCheckProcessor = null;
  let liquidationCheckInterval = null;
  let dailyCheckInterval = null;

  // Initialize the daily check processor with schedule
  const schedule = new ExecutionSchedule({
    timeZone: 'America/Chicago',
    targetHour: 5,
    targetMinute: 0
  });

  // Create liquidation monitor with HTTP provider
  blockProcessor = new LiquidationMonitor({
    provider,
    vaultManager,
    dyad
  });

  dailyCheckProcessor = new DailyCheckProcessor({
    schedule,
    noteMessages,
    noteIds: process.env.NOTE_IDS
  });

  // Function to check for liquidatable notes
  const checkLiquidatableNotes = async () => {
    console.log(`Checking for liquidatable notes at ${new Date().toISOString()}`);

    try {
      const messages = await blockProcessor.fetchLiquidatableNotes();

      // Send messages if there are any
      await discordClient.notifyAll(messages);
    } catch (error) {
      console.error('Error checking for liquidatable notes:', error.message);
      await notify(`Error checking for liquidatable notes: ${error.message}`);
    }
  };

  // Set up daily check interval
  const checkDailyTasks = async () => {
    const currentDate = new Date();
    const messages = await dailyCheckProcessor.checkAndRun(currentDate);

    // Send messages if there are any
    await discordClient.notifyAll(messages);
  };

  // Run the initial checks
  await checkLiquidatableNotes();
  await checkDailyTasks();

  // Set up intervals
  liquidationCheckInterval = setInterval(checkLiquidatableNotes, 60 * 1000); // Check every minute
  dailyCheckInterval = setInterval(checkDailyTasks, 60 * 1000); // Check for daily tasks every minute

  // Keep the process running
  process.stdin.resume();

  // Handle cleanup on exit
  process.on('SIGINT', async () => {
    console.log('Stopping watcher...');

    // Clear intervals
    if (liquidationCheckInterval) {
      clearInterval(liquidationCheckInterval);
    }

    if (dailyCheckInterval) {
      clearInterval(dailyCheckInterval);
    }

    // Clean up Discord client when watch command is interrupted
    console.log('Cleaning up Discord client...');
    await discordClient.destroy();

    console.log('Cleanup complete, exiting...');
    process.exit(0);
  });
}

async function checkVault(asset) {
  const noteId = process.env.NOTE_IDS.split(',')[0];

  const vaultAddress = VAULT_ADDRESSES[asset];
  if (!vaultAddress) {
    console.error(`Unknown asset: ${asset}. Available assets: ${Object.keys(VAULT_ADDRESSES).join(', ')}`);
    return;
  }

  const vault = await utils.openContract(vaultAddress, 'abi/Vault.json', provider);
  const balance = await vault.id2asset(noteId);
  console.log(`Balance in ${asset} vault for note ${noteId}: ${ethers.formatUnits(balance, 18)}`);
}

async function claimCommand() {
  if (!wallet) {
    throw new Error('Wallet not initialized');
  }

  const { claimable, claimableMp, gas, usdGasCost, percentage } = await estimateClaim();

  // if the gas is less than 1% of the value, execute the transaction
  if (claimable > 0 && percentage < 0.01) {
    console.log(`Claiming ${utils.formatNumber(ethers.formatUnits(claimable, 18))} KERO ($${utils.formatNumber(claimableMp, 2)}) for ${ethers.formatEther(gas)} ETH ($${utils.formatNumber(usdGasCost, 2)})`);
    await claim();
  }
}

async function withdrawFromVault(asset, amount) {
  if (!wallet) {
    throw new Error('Wallet not initialized');
  }

  const vaultAddress = VAULT_ADDRESSES[asset];
  if (!vaultAddress) {
    throw new Error(`Unknown asset: ${asset}. Available assets: ${Object.keys(VAULT_ADDRESSES).join(', ')}`);
  }

  const noteId = process.env.NOTE_IDS.split(',')[0];
  const parsedAmount = ethers.parseUnits(amount, 18);

  console.log(`Withdrawing ${amount} ${asset} from note ${noteId}`);

  const vaultManagerWriter = vaultManager.connect(wallet);
  await vaultManagerWriter.withdraw(noteId, vaultAddress, parsedAmount, wallet.address)
    .then(tx => tx.wait());
}

async function listNotes() {
  const notes = await GraphNote.search();
  const filteredNotes = notes
    .filter(note => note.collatRatio <= ethers.parseUnits('1.6', 18))
    .filter(note => note.dyad >= ethers.parseUnits('100', 18))
    .sort((a, b) => Number(ethers.formatUnits(a.collatRatio, 18)) - Number(ethers.formatUnits(b.collatRatio, 18)));

  filteredNotes.forEach(note => {
    console.log(note.toString());
  });
}

async function liquidateNote(noteId, dyadAmount) {
  const mintedDyad = await dyad.mintedDyad(noteId);
  const dyadAmountBigInt = ethers.parseUnits(dyadAmount, 18);

  if (dyadAmountBigInt > mintedDyad) {
    console.error(`Cannot liquidate more than the minted amount. Note ${noteId} has ${ethers.formatUnits(mintedDyad, 18)} DYAD minted.`);
    return;
  }

  const targetNoteId = process.env.NOTE_IDS.split(',')[0];

  console.log(`Attempting to liquidate ${dyadAmount} DYAD from note ${noteId}`);
  const cr = await vaultManager.collatRatio(noteId);
  const crFloat = utils.formatNumber(ethers.formatUnits(cr, 18), 3);
  console.log(`Current collateral ratio: ${crFloat}`);

  // make sure CR is below 1.5
  if (crFloat > 1.5) {
    console.error(`Collateral ratio is too high to liquidate.`);
    return;
  }

  if (!wallet) {
    console.error('Wallet not initialized');
    return;
  }

  const vaultManagerWriter = vaultManager.connect(wallet);

  // determine how much DYAD to mint (if we already hold some, we don't need to mint it)
  const dyadBalance = await dyad.balanceOf(wallet.address);
  const dyadToMint = dyadAmountBigInt - dyadBalance;

  // mint DYAD
  if (dyadToMint > 0) {
    console.log(`minting ${ethers.formatUnits(dyadToMint, 18)} DYAD`);
    await vaultManagerWriter
      .mintDyad(targetNoteId, dyadToMint, wallet.address)
      .then(tx => tx.wait());
  }

  // check and set approval for DYAD
  const dyadWriter = dyad.connect(wallet);
  const currentAllowance = await dyad.allowance(wallet.address, VAULT_MANAGER_ADDRESS);
  if (currentAllowance < dyadAmountBigInt) {
    console.log(`Approving DYAD transfer for ${ethers.formatUnits(dyadAmountBigInt, 18)} DYAD`);
    await dyadWriter
      .approve(VAULT_MANAGER_ADDRESS, dyadAmountBigInt)
      .then(tx => tx.wait());
  }

  // liquidate the note
  console.log(`liquidating note ${noteId}`);
  await vaultManagerWriter
    .liquidate(noteId, targetNoteId, dyadAmountBigInt)
    .then(tx => tx.wait());
}

async function main() {
  await initializeWallet();
  await initializeContracts();

  const discordInitialized = await discordClient.initialize();
  if (!discordInitialized) {
    console.warn('Discord client failed to initialize. Notifications will be logged to console only.');
  }

  const program = new Command();

  // Track if we're running the watch command
  let isWatchCommand = false;

  program
    .name('dyad-monitor')
    .description('CLI tool for monitoring DYAD notes')
    .version('1.0.0');

  program.command('monitor')
    .description('Monitor note status and send to Discord')
    .action(monitorCommand);

  program.command('check-note')
    .description('Check collateral ratio for a specific note')
    .argument('<noteId>', 'Note ID to check')
    .action(checkNote);

  program.command('liquidate')
    .description('Liquidate a note')
    .argument('<noteId>', 'Note ID to liquidate')
    .argument('<dyadAmount>', 'Amount of DYAD to liquidate')
    .action(liquidateNote);

  program.command('check-vault')
    .description('Check vault asset balance for a note')
    .argument('<asset>', 'Asset vault to check (KEROSENE, WETH)')
    .action(checkVault);

  program.command('list')
    .description('List notes that are close to liquidation')
    .action(listNotes);

  program.command('withdraw')
    .description('Withdraw assets from a vault')
    .argument('<asset>', 'Asset to withdraw (KEROSENE, WETH)')
    .argument('<amount>', 'Amount to withdraw')
    .action(withdrawFromVault);

  program.command('claim')
    .description('Claim rewards to vault')
    .action(claimCommand);

  program.command('check-risk')
    .description('Check risk metrics for a note')
    .argument('<noteId>', 'Note ID to check')
    .action(checkRiskCommand);

  program.command('check-claimable')
    .description('Check how much KEROSENE can be claimed')
    .action(checkClaimableCommand);

  program.command('mint')
    .description('Mint DYAD for a note')
    .argument('<noteId>', 'Note ID to mint DYAD for')
    .argument('<amount>', 'Amount of DYAD to mint')
    .action(mintCommand);

  program.command('burn')
    .description('Burn DYAD for a note')
    .argument('<noteId>', 'Note ID to burn DYAD from')
    .argument('<amount>', 'Amount of DYAD to burn')
    .action(burnCommand);

  program.command('balance')
    .description('Check DYAD balance in wallet and minted by notes')
    .action(balanceCommand);

  program.command('watch')
    .description('Watch for new blocks in real-time')
    .action(() => {
      isWatchCommand = true;
      return watchCommand();
    });

  await program.parseAsync();

  // Only cleanup Discord client if we're NOT running the watch command
  if (!isWatchCommand) {
    await discordClient.destroy();
  }
}

main().catch(error => {
  console.error(error);
  notify(`Failure: ${error.message}`);
  process.exit(1);
});
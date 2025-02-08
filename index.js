
import { Client, GatewayIntentBits } from 'discord.js';
import { ethers } from 'ethers';
import { readFile } from 'fs/promises';
import { Command } from 'commander';

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

const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_RPC_URL);

let wallet;
let vaultManager;
let keroseneVault;
let dyadLpStakingFactory;
let dyad;
let discord;

async function openContract(address, abiFilename) {
  return readFile(abiFilename, 'utf8')
    .then(JSON.parse)
    .then(abi => new ethers.Contract(address, abi, provider));
}

async function initializeWallet() {
  if (process.env.PRIVATE_KEY) {
    wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  }
}

async function initializeContracts() {
  vaultManager = await openContract(VAULT_MANAGER_ADDRESS, 'abi/VaultManagerV5.json');
  keroseneVault = await openContract(KEROSENE_VAULT_ADDRESS, 'abi/KeroseneVault.json');
  dyadLpStakingFactory = await openContract(DYAD_LP_STAKING_FACTORY_ADDRESS, 'abi/DyadLPStakingFactory.json');
  dyad = await openContract(DYAD_ADDRESS, 'abi/Dyad.json');
}

async function initializeDiscord() {
  discord = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  discord.on('error', console.error);

  await discord.login(process.env.DISCORD_APP_TOKEN);
  console.log(`Logged in as ${discord.user.tag}!`);
}

async function notify(message) {
  if (process.env.NODE_ENV == 'dev') {
    console.log(message);
  } else {
    await discord.channels.fetch(process.env.DISCORD_CHANNEL_ID)
      .then(channel => channel.send(`\`\`\`>> DYAD Monitor\n===\n${message}\`\`\``));
  }
}

async function fetchKeroPrice() {
  return fetch(`https://api.dexscreener.com/latest/dex/search?q=KEROSENE%20WETH`)
    .then(res => res.json())
    .then(data => parseFloat(data.pairs[0].priceUsd))
    .catch(err => {
      console.error(err);
      return 0;
    });
}

async function fetchRewards(noteId) {
  return fetch(`https://api.dyadstable.xyz/api/rewards/${noteId}`)
    .then(response => response.json());
}

async function fetchYield(noteId) {
  return fetch(`https://api.dyadstable.xyz/api/yields/${noteId}`)
    .then(response => response.json());
}

function formatNumber(numberString, decimalPlaces = 0) {
  const number = parseFloat(numberString);
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(number * factor) / factor;
}

async function noteMessages(noteId) {
  const messages = [];

  const mp = await fetchKeroPrice();
  const dv = await keroseneVault.assetPrice().then(r => parseFloat(r) * 10 ** -8);

  messages.push(`Note: ${noteId}`);

  const cr = await vaultManager.collatRatio(noteId);
  const crFloat = formatNumber(ethers.formatUnits(cr, 18), 3);
  messages.push(`CR: ${crFloat}`);

  const y = await fetchYield(noteId);
  
  const noteXp = y[Object.keys(y)[0]].noteXp;
  messages.push(`XP: ${formatNumber(noteXp, 2)}`);

  const claimed = await dyadLpStakingFactory.noteIdToTotalClaimed(noteId);
  const r = await fetchRewards(noteId);
  const claimable = BigInt(r.amount) - claimed;
  messages.push(`Claimable: ${formatNumber(ethers.formatUnits(claimable, 18))} KERO ($${formatNumber(parseFloat(claimable) * 10 ** -18 * mp, 2)})`);
  
  for (const key in y) {
    const vault = y[key];
    if (parseFloat(vault.noteLiquidity) > 0) {
      messages.push('---');
      messages.push(`LP: ${LP_TOKENS[vault.lpToken]}`);
      messages.push(`Liquidity: ${formatNumber(vault.noteLiquidity)}`);

      const keroPerWeek = parseFloat(vault.kerosenePerYear) / 52;
      messages.push(`KERO/week: ${formatNumber(keroPerWeek)} ($${formatNumber(keroPerWeek * mp, 2)})`);

      const mpApr = parseFloat(vault.kerosenePerYear) * mp / parseFloat(vault.noteLiquidity);
      messages.push(`MP-APR: ${formatNumber(mpApr * 100, 2)}%`);

      const dvApr = parseFloat(vault.kerosenePerYear) * dv / parseFloat(vault.noteLiquidity);
      messages.push(`DV-APR: ${formatNumber(dvApr * 100, 2)}%`);
    }
  }

  if (crFloat < LOWER_CR) {
    const totalValue = await vaultManager.getTotalValue(noteId);
    const mintedDyad = await dyad.mintedDyad(noteId);
    const targetDebt = parseFloat(ethers.formatUnits(totalValue, 18)) / TARGET_CR;
    const dyadToBurn = parseFloat(ethers.formatUnits(mintedDyad, 18)) - targetDebt;
    messages.push('---');
    messages.push(`Recommendation: Burn ${formatNumber(dyadToBurn, 0)} DYAD`);
  } else if (crFloat > UPPER_CR) {
    const totalValue = await vaultManager.getTotalValue(noteId);
    const mintedDyad = await dyad.mintedDyad(noteId);
    const targetDebt = parseFloat(ethers.formatUnits(totalValue, 18)) / TARGET_CR;
    const dyadToMint = targetDebt - parseFloat(ethers.formatUnits(mintedDyad, 18));
    messages.push('---');
    messages.push(`Recommendation: Mint ${formatNumber(dyadToMint, 0)} DYAD`);
  }

  return messages.join('\n');
}

class GraphNote {
  constructor(data) {
    this.id = data.id;
    this.collatRatio = BigInt(data.collatRatio);
    this.kerosene = BigInt(data.kerosene);
    this.dyad = BigInt(data.dyad);
    this.xp = BigInt(data.xp);
    this.collateral = BigInt(data.collateral);
  }

  toString() {
    return [
      `Note ID: ${this.id}`,
      `Collateral Ratio: ${ethers.formatUnits(this.collatRatio, 18)}`,
      `DYAD: ${ethers.formatUnits(this.dyad, 18)}`,
      `Collateral: ${ethers.formatUnits(this.collateral, 18)}`,
      '---'
    ].join('\n');
  }

  static async search() {
    const query = `{
      notes(limit: 1000) {
        items {
          id
          collatRatio
          kerosene
          dyad
          xp
          collateral
          __typename
        }
        __typename
      }
    }`;

    const response = await fetch('https://api.dyadstable.xyz/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    return data.data.notes.items.map(item => new GraphNote(item));
  }
}

async function monitorCommand() {
  const noteIds = process.env.NOTE_IDS.split(',');
  const messages = [];
  for (const noteId of noteIds) {
    messages.push(await noteMessages(noteId));
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
        const vault = await openContract(vaultAddress, 'abi/Vault.json');
        const assetAddress = await vault.asset();
        const asset = await openContract(assetAddress, 'abi/ERC20.json');
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
  const crFloat = formatNumber(ethers.formatUnits(cr, 18), 3);
  console.log(`Collateral Ratio for Note ${noteId}: ${crFloat}`);

  const mintedDyad = await dyad.mintedDyad(noteId);
  console.log(`Minted DYAD: $${ethers.formatUnits(mintedDyad, 18)}`);
  
  const vaults = await vaultManager.getVaults(noteId);
  vaults.forEach(async (vaultAddress) => {
    const vault = await openContract(vaultAddress, 'abi/Vault.json');
    const assetAddress = await vault.asset();
    const asset = await openContract(assetAddress, 'abi/ERC20.json');
    const symbol = await asset.symbol();
    const usdValue = await vault.getUsdValue(noteId);
    console.log(`${symbol}: $${formatNumber(ethers.formatUnits(usdValue, 18), 2)}`);
  });
}

async function checkVault(asset) {
  const noteId = process.env.NOTE_IDS.split(',')[0];
  
  const vaultAddress = VAULT_ADDRESSES[asset];
  if (!vaultAddress) {
    console.error(`Unknown asset: ${asset}. Available assets: ${Object.keys(VAULT_ADDRESSES).join(', ')}`);
    return;
  }

  const vault = await openContract(vaultAddress, 'abi/Vault.json');
  const balance = await vault.id2asset(noteId);
  console.log(`Balance in ${asset} vault for note ${noteId}: ${ethers.formatUnits(balance, 18)}`);
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
  
  const vaultManagerWriter = vaultManager.connect(wallet);
  await vaultManagerWriter.withdraw(noteId, vaultAddress, wallet.address, parsedAmount)
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
  const crFloat = formatNumber(ethers.formatUnits(cr, 18), 3);
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

  // liquidate the note
  console.log(`liquidating note ${noteId}`);
  await vaultManagerWriter
    .liquidate(noteId, targetNoteId, dyadAmountBigInt)
    .then(tx => tx.wait());
}

async function main() {
  await initializeWallet();
  await initializeContracts();
  await initializeDiscord();

  const program = new Command();

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

  await program.parseAsync();
  
  // Cleanup
  await discord.destroy();
}

main().catch(error => {
  console.error(error);
  notify(`Failure: ${error.message}`);
  process.exit(1);
});

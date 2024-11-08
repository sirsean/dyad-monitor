import { Client, GatewayIntentBits } from 'discord.js';
import { ethers } from 'ethers';
import { readFile } from 'fs/promises';

const VAULT_MANAGER_ADDRESS = '0xB62bdb1A6AC97A9B70957DD35357311e8859f0d7';
const KEROSENE_VAULT_ADDRESS = '0x4808e4CC6a2Ba764778A0351E1Be198494aF0b43';
const DYAD_LP_STAKING_FACTORY_ADDRESS = '0xD19DCbB8B82805d779a6A2182d8F4355275CC30a';
const LP_TOKENS = {
  '0xa969cFCd9e583edb8c8B270Dc8CaFB33d6Cf662D': 'DYAD/wM',
  '0x1507bf3F8712c496fA4679a4bA827F633979dBa4': 'DYAD/USDC',
}

const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_RPC_URL);

const vaultManager = await readFile('abi/VaultManagerV5.json', 'utf8')
  .then(JSON.parse)
  .then(abi => new ethers.Contract(VAULT_MANAGER_ADDRESS, abi, provider));

const keroseneVault = await readFile('abi/KeroseneVault.json', 'utf8')
  .then(JSON.parse)
  .then(abi => new ethers.Contract(KEROSENE_VAULT_ADDRESS, abi, provider));

const dyadLpStakingFactory = await readFile('abi/DyadLPStakingFactory.json', 'utf8')
  .then(JSON.parse)
  .then(abi => new ethers.Contract(DYAD_LP_STAKING_FACTORY_ADDRESS, abi, provider));

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});

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
  messages.push(`CR: ${formatNumber(ethers.formatUnits(cr, 18), 3)}`);


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
      messages.push(`Bonus: ${formatNumber(vault.effectiveSize, 2)}x`);

      const keroPerWeek = parseFloat(vault.kerosenePerYear) / 52;
      messages.push(`KERO/week: ${formatNumber(keroPerWeek)} ($${formatNumber(keroPerWeek * mp, 2)})`);

      const mpApr = parseFloat(vault.kerosenePerYear) * mp / parseFloat(vault.noteLiquidity);
      messages.push(`MP-APR: ${formatNumber(mpApr * 100, 2)}%`);

      const dvApr = parseFloat(vault.kerosenePerYear) * dv / parseFloat(vault.noteLiquidity);
      messages.push(`DV-APR: ${formatNumber(dvApr * 100, 2)}%`);
    }
  }

  //const r = await fetchRewards(noteId);
  //console.log(r);

  return messages.join('\n');
}

async function main() {
  const noteIds = process.env.NOTE_IDS.split(',');
  const messages = [];
  for (const noteId of noteIds) {
    messages.push(await noteMessages(noteId));
  }
  notify(messages.join('\n===\n'));
}

discord.once('ready', async () => {
  console.log(`Logged in as ${discord.user.tag}!`);

  // run the program code
  await main()
    .catch(error => console.error(error))
    // need to do this to let the process end
    .finally(() => discord.destroy());
});

discord.on('error', console.error);

await discord.login(process.env.DISCORD_APP_TOKEN);
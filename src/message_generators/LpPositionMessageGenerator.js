
import NoteMessageGenerator from './NoteMessageGenerator.js';
import { fetchYield, formatNumber } from '../utils.js';
import Pricer from '../Pricer.js';
import { LP_TOKENS } from '../constants.js';
import { getContracts } from '../contracts.js';

/**
 * Generates LP position messages for a note
 */
class LpPositionMessageGenerator extends NoteMessageGenerator {
  /**
   * Constructor for LpPositionMessageGenerator
   */
  constructor() {
    super();
  }

  /**
   * Generate LP position messages for a note
   * @param {string} noteId - The note ID
   * @returns {Promise<string[]>} Array of message lines
   */
  async generate(noteId) {
    const messages = [];
    
    const { keroseneVault } = getContracts();
    const pricer = new Pricer();
    const mp = await pricer.getPrice('KEROSENE');
    const dv = await keroseneVault.assetPrice().then(r => parseFloat(r) * 10 ** -8);
    
    const y = await fetchYield(noteId);
    
    for (const key in y) {
      const vault = y[key];
      if (parseFloat(vault.noteLiquidity) > 0) {
        messages.push('---');
        messages.push(`LP: ${LP_TOKENS[vault.lpToken]}`);
        messages.push(`Liquidity: ${formatNumber(vault.noteLiquidity)}`);

        const keroPerWeek = parseFloat(vault.kerosenePerYear) / 52;
        messages.push(`KERO/week: ${formatNumber(keroPerWeek)} ($${formatNumber(keroPerWeek * mp, 2)}/$${formatNumber(keroPerWeek * dv, 2)})`);

        const mpApr = parseFloat(vault.kerosenePerYear) * mp / parseFloat(vault.noteLiquidity);
        messages.push(`MP-APR: ${formatNumber(mpApr * 100, 2)}%`);

        const dvApr = parseFloat(vault.kerosenePerYear) * dv / parseFloat(vault.noteLiquidity);
        messages.push(`DV-APR: ${formatNumber(dvApr * 100, 2)}%`);
      }
    }
    
    return messages;
  }
}

export default LpPositionMessageGenerator;

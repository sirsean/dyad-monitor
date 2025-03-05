
import { ethers } from 'ethers';

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

export default GraphNote;

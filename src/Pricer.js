
class Pricer {
  constructor() {
    this.tokenKeys = {
      'ETH': 'coingecko:ethereum',
      'DYAD': 'coingecko:dyad',
      'KEROSENE': 'coingecko:kerosene',
    };
  }

  /**
   * Get the price of a token in USD, from the DefiLlama API.
   */
  async getPrice(token) {
    const key = this.tokenKeys[token];
    return fetch(`https://coins.llama.fi/prices/current/${key}?searchWidth=4h`)
      .then(res => res.json())
      .then(data => data.coins[key].price)
      .catch(err => {
        console.error(err);
        return 0;
      });
  }
}

export default Pricer;

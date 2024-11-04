# DYAD Monitor

This program is for monitor your Dyad notes.

The things you'll care about are:

1. Your Note's collateral ratio
2. Your Note's XP
3. The LP positions you have staked, and how big they are
4. How much KERO you are earning
5. Your current APY

The `dyad-monitor` runs, reaching out to the DYAD API to fetch your yield/reward information, and to the DYAD `VaultManager` contract for your collateral ratio.

It is intended to run in Replit, with the following secrets or environment variables:

- `DISCORD_CHANNEL_ID`
- `DISCORD_APP_TOKEN`
- `ALCHEMY_RPC_URL`
- `NOTE_IDS`

When it finishes collecting the information, it formats it as a message to send to Discord. You will need to set up a Discord bot with write access to a channel in your Discord server to receive the data.

It is intended to run as a scheduled deployment in Replit, as often as you want to hear about your position. I run it daily at 5am.
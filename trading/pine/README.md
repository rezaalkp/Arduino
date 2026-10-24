# BTC Fib + RTM (TradingView Pine)

Strategy for Bitcoin perpetual / spot on **1m–15m** charts.

## Install

1. Open TradingView → chart `BTCUSDT.P` (or `BTCUSD`).
2. Set timeframe to **1**, **3**, **5**, or **15** minutes.
3. Pine Editor → New → paste contents of `BTC_Fib_RTM_1to15.pine` → **Add to chart**.
4. Open **Strategy Tester** to see results.

## Suggested settings

| Input | Suggested |
|-------|-----------|
| Higher TF | `240` (4H) or `60` (1H) |
| Chart TF | `1`–`15` |
| TP Fib | `1.618` |
| Show 1.86 | on |

## Logic summary

- HTF Fib (two zones) → bias BUY/SELL
- LTF Order Block (RTM) → entry + tight stop beyond OB
- Target → Fib **1.618** of first wave (two zones)
- Break of previous zone → Fib updates higher/lower
- Weakness at 1.618 → optional reverse

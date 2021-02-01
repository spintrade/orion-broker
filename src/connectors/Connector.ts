import {Balances, Exchange, SendOrder, Side, SubOrder, Trade, Withdraw} from '../Model';
import BigNumber from 'bignumber.js';

export interface Connector {
    exchange: Exchange;

    submitSubOrder(subOrderId: number, symbol: string, side: Side, amount: BigNumber, price: BigNumber, type: string): Promise<SendOrder>;

    cancelSubOrder(subOrder: SubOrder): Promise<boolean>;

    getBalances(): Promise<Balances>;

    setOnTradeListener(onTrade: (trade: Trade) => void): void;

    // checkSubOrders(subOrders: SubOrder[]): Promise<void>;

    checkTrades(trades: Trade[]): Promise<void>;

    hasWithdraw(): boolean;

    withdraw(currency: string, amount: BigNumber, address: string): Promise<string | undefined>;

    checkWithdraws(withdraws: Withdraw[]): Promise<ExchangeWithdrawStatus[]>;

    destroy(): void;
}

export interface ExchangeWithdrawStatus {
    exchangeWithdrawId: string;
    status: 'ok' | 'failed' | 'canceled';
}

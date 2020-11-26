import {BlockchainOrder, Side, Trade} from "./Model";
import {DbSubOrder} from "./db/Db";
import BigNumber from "bignumber.js";
import {log} from "./log";

import Web3 from "web3";
import Long from 'long';
import {signTypedMessage} from "eth-sig-util";
import {privateToAddress} from 'ethereumjs-util';

const DOMAIN_TYPE = [
    {name: "name", type: "string"},
    {name: "version", type: "string"},
    {name: "chainId", type: "uint256"},
    {name: "salt", type: "bytes32"},
];

const ORDER_TYPE = [
    {name: "senderAddress", type: "address"},
    {name: "matcherAddress", type: "address"},
    {name: "baseAsset", type: "address"},
    {name: "quoteAsset", type: "address"},
    {name: "matcherFeeAsset", type: "address"},
    {name: "amount", type: "uint64"},
    {name: "price", type: "uint64"},
    {name: "matcherFee", type: "uint64"},
    {name: "nonce", type: "uint64"},
    {name: "expiration", type: "uint64"},
    {name: "buySide", type: "uint8"},
];

const DOMAIN_DATA = {
    name: "Orion Exchange",
    version: "1",
    chainId: 3,
    salt:
        "0xf2d857f4a3edcb9b78b4d503bfe733db1e3f6cdc2b7971ee739626c97e86a557",
};

const Assets = {
    "ETH": "0x0000000000000000000000000000000000000000",
    "USDT": "0xfc1cd13a7f126efd823e373c4086f69beb8611c2",
    "ORN": "0xfc25454ac2db9f6ab36bc0b0b034b41061c00982",

    toSymbolAsset: function (asset: string): string {
        switch (asset) {
            case this.ETH:
                return 'ETH';
            case this.USDT:
                return 'USDT';
            case this.ORN:
                return 'ORN';
            default:
                throw new Error('Unknown assets ' + asset);
        }
    },

    toAssetAddress: function (asset: string): string {
        switch (asset) {
            case 'ETH':
                return this.ETH;
            case 'USDT':
                return this.USDT;
            case 'ORN':
                return this.ORN;
            default:
                throw new Error('Unknown assets ' + asset);
        }
    },

    toSymbol: function (baseAsset: string, quoteAsset: string): string {
        return this.toSymbolAsset(baseAsset) + '-' + this.toSymbolAsset(quoteAsset)
    },
    toAssets: function (symbol: string): string[] {
        const symbols = symbol.split('-');
        return [this.toAssetAddress(symbols[0]), this.toAssetAddress(symbols[1])];
    }
};

function longToHex(long: number): string {
    return Web3.utils.bytesToHex(Long.fromNumber(long).toBytesBE());
}

export function hashOrder(order: BlockchainOrder): string {
    return Web3.utils.soliditySha3(
        "0x03",
        order.senderAddress,
        order.matcherAddress,
        order.baseAsset,
        order.quoteAsset,
        order.matcherFeeAsset,
        longToHex(order.amount),
        longToHex(order.price),
        longToHex(order.matcherFee),
        longToHex(order.nonce),
        longToHex(order.expiration),
        order.buySide ? '0x01' : '0x00'
    );
}

export interface OrionBlockchainSettings {
    matcherAddress: string;
    privateKey: string;
}

const DEFAULT_EXPIRATION = 29 * 24 * 60 * 60 * 1000;

export class OrionBlockchain {
    matcherAddress: string;
    bufferKey: Buffer;
    address: string;

    constructor(settings: OrionBlockchainSettings) {
        this.matcherAddress = settings.matcherAddress;
        try {
            this.bufferKey = Buffer.from(settings.privateKey.substr(2), "hex");
            this.address = '0x' + privateToAddress(this.bufferKey).toString('hex');
            log.log('My address=' + this.address);
        } catch (e) {
            log.error('Orion blockchain init', e);
        }
    }

    // private async validateSignature(signature: string, orderInfo: OrderInfo): Promise<string> {
    //     let message = this.hashOrder(orderInfo);
    //     let sender = await this.web3.eth.accounts.recover(message, signature);
    //     return sender;
    // }

    private signOrder(order: BlockchainOrder): string {
        const data = {
            types: {
                EIP712Domain: DOMAIN_TYPE,
                Order: ORDER_TYPE,
            },
            domain: DOMAIN_DATA,
            primaryType: "Order",
            message: order,
        };

        const msgParams = {data};
        return signTypedMessage(this.bufferKey, msgParams as any, "V4");
    }

    private toBaseUnit(amount: BigNumber, decimals: number = 8): number {
        return Math.round(amount.toNumber() * 10 ** decimals);
    }

    private counterSide(side: Side): number {
        return side === 'buy' ? 0 : 1;
    }

    private createBlockchainOrder(subOrder: DbSubOrder, trade: Trade): BlockchainOrder {
        const assets = Assets.toAssets(subOrder.symbol);
        const buySide = this.counterSide(subOrder.side);
        const matcherFeeAsset = buySide ? assets[0] : assets[1];

        const MATCHER_FEE_PERCENT = new BigNumber(0.2).dividedBy(100); // 0.2%
        const matcherFee: BigNumber = buySide ? trade.amount.multipliedBy(MATCHER_FEE_PERCENT) : trade.amount.multipliedBy(trade.price).multipliedBy(MATCHER_FEE_PERCENT);

        return {
            id: '',
            senderAddress: this.address,
            matcherAddress: this.matcherAddress,
            baseAsset: assets[0],
            quoteAsset: assets[1],
            matcherFeeAsset:  matcherFeeAsset,
            amount: this.toBaseUnit(trade.amount),
            price: this.toBaseUnit(trade.price),
            matcherFee: this.toBaseUnit(matcherFee),
            nonce: trade.timestamp,
            expiration: trade.timestamp + DEFAULT_EXPIRATION,
            buySide: buySide,
            signature: ''
        };
    }

    public async signTrade(subOrder: DbSubOrder, trade: Trade): Promise<BlockchainOrder> {
        const bo = this.createBlockchainOrder(subOrder, trade);
        bo.id = hashOrder(bo);
        bo.signature = this.signOrder(bo);

        /* const sender = await this.validateSignature(bo.signature, bo); */
        return bo;
    }
}
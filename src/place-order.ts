import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { DriftClient, getUserAccountPublicKeySync, MarketType, OrderParams, OrderType, PositionDirection, getPerpMarketPublicKey, getSpotMarketPublicKey } from '@drift-labs/sdk';
import * as fs from "fs";
import * as path from "path";
import { BN } from 'bn.js';

// Initialize connection and wallet
const connection = new Connection("https://api.devnet.solana.com");
const keypairData = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../keypair.json"), "utf-8")
);
const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: Transaction) => {
        tx.sign(keypair);
        return tx;
    },
    signAllTransactions: async (txs: Transaction[]) => {
        return txs.map((tx) => {
            tx.sign(keypair);
            return tx;
        });
    },
};

// Initialize DriftClient
const driftClient = new DriftClient({
    connection,
    wallet,
    programID: new PublicKey("EpNqZ7KyCuW9yJb7hNAvqchB6S5oSCNpQhpmnNZDYwUJ"),
    opts: {
        commitment: 'confirmed',
    },
});

async function placePredictionMarketOrder() {
    const userAccountPublicKey = getUserAccountPublicKeySync(
        driftClient.program.programId,
        keypair.publicKey
    );
    console.log("User account public key:", userAccountPublicKey.toBase58());

    try {
        // Subscribe to the client
        await driftClient.subscribe();

        // Wait for state account to be loaded
        const stateAccount = await driftClient.getStateAccount();
        console.log("State account loaded");

        // Get perp market public key
        const perpMarketPublicKey = await getPerpMarketPublicKey(
            driftClient.program.programId,
            1 // marketIndex
        );
        console.log("Perp market public key:", perpMarketPublicKey.toBase58());

        // Get spot market public key (USDC market)
        const spotMarketPublicKey = await getSpotMarketPublicKey(
            driftClient.program.programId,
            0 // USDC market index
        );
        console.log("Spot market public key:", spotMarketPublicKey.toBase58());

        // Wait for perp market account to be loaded
        const perpMarketAccount = await driftClient.getPerpMarketAccount(1);
        if (!perpMarketAccount) {
            throw new Error("Perp market account not found");
        }
        console.log("Perp market account loaded");

        // Wait for spot market account to be loaded
        const spotMarketAccount = driftClient.getSpotMarketAccount(0);
        if (!spotMarketAccount) {
            throw new Error("Spot market account not found");
        }
        console.log("Spot market account loaded");

        // Define order parameters
        const orderParams: OrderParams = {
            marketType: MarketType.PERP,
            marketIndex: 1,
            direction: PositionDirection.LONG,
            orderType: OrderType.MARKET,
            baseAssetAmount: new BN(1000000),
            price: new BN(0),
            reduceOnly: false,
            postOnly: false,
            maxTs: new BN(Date.now() / 1000 + 60),
            userOrderId: 0,
            bitFlags: 0,
            triggerPrice: new BN(0),
            triggerCondition: 0,
            oraclePriceOffset: 0,
            auctionStartPrice: new BN(0),
            auctionEndPrice: new BN(0),
            auctionDuration: 0
        };

        // Place the order
        const ix = await driftClient.getPlacePerpOrderIx(
            orderParams,
            0 // subAccountId
        );
        const tx = new Transaction();
        tx.add(ix);
        tx.feePayer = keypair.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const txSig = await connection.sendTransaction(tx, [keypair], {
            skipPreflight: true,
        });
        console.log("Waiting for confirmation...");
        await driftClient.connection.confirmTransaction(txSig);
        console.log("Transaction confirmed!");
        console.log("Order placed!", txSig);
    } catch (error) {
        console.error('Error placing order:', error);
    } finally {
        // Cleanup
        await driftClient.unsubscribe();
    }
}

// Run the function
placePredictionMarketOrder();
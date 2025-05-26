import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  AdminClient,
  OracleSource,
  BN,
  ContractTier,
  BASE_PRECISION,
  PRICE_PRECISION,
  ONE,
  ZERO,
  PEG_PRECISION,
} from "@drift-labs/sdk";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function main() {
  // Connect to devnet
  const connection = new Connection("https://api.devnet.solana.com");

  // Load the keypair from file
  const keypairData = JSON.parse(
    fs.readFileSync(path.join(os.homedir(), process.env.ADMIN_PRIVATE_KEY_PATH!), "utf-8")
  );
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log("Your wallet public key:", keypair.publicKey.toBase58());

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

  // Program ID
  const programId = new PublicKey(process.env.PROGRAM_ID!);

  // Initialize AdminClient
  const adminClient = new AdminClient({
    connection,
    wallet,
    programID: programId,
    opts: {
      commitment: "confirmed",
    },
  });

  const statePublicKey = await adminClient.getStatePublicKey();

  // Check if the state account exists
  const stateAccount = await adminClient.connection.getAccountInfo(
    statePublicKey
  );
  if (!stateAccount) {
    throw new Error(
      "State account does not exist at: " + statePublicKey.toBase58() + ". Please run initialize-program.ts first."
    );
  }

  // Subscribe to the client
  await adminClient.subscribe();

  try {
    const state = adminClient.getStateAccount();
    
    // Get the current number of markets
    const marketIndex = state.numberOfMarkets;
    console.log("Current number of markets:", marketIndex);

    // Create a perp market
    const priceOracle = new PublicKey(
      "FgBGHNex4urrBmNbSj8ntNQDGqeHcWewKtkvL6JE6dEX" //got this from sdk
    ); // You'll need to set up an oracle

    // (I have no idea what these numbers are supposed to be)
    const baseAssetReserve = new BN("1000000000"); // 1 unit of base asset
    const quoteAssetReserve = new BN("1000000000"); // 1 unit of quote asset
    const periodicity = new BN("3600"); // 1 hour

    // Initialize perp market
    const ixs = await adminClient.getInitializePerpMarketIx(
      marketIndex,
      priceOracle,
      baseAssetReserve,
      quoteAssetReserve,
      periodicity,
      PEG_PRECISION, // pegMultiplier
      OracleSource.PYTH_PULL, // oracleSource
      ContractTier.SPECULATIVE, // contractTier
      2000, // marginRatioInitial (20%)
      500, // marginRatioMaintenance (5%)
      0, // liquidatorFee
      10000, // ifLiquidatorFee (1%)
      0, // imfFactor
      false, // activeStatus
      0, // baseSpread
      142500, // maxSpread (14.25%)
      ZERO, // maxOpenInterest
      ZERO, // maxRevenueWithdrawPerPeriod
      ZERO, // quoteMaxInsurance
      BASE_PRECISION.divn(10000), // orderStepSize
      PRICE_PRECISION.divn(100000), // orderTickSize
      BASE_PRECISION.divn(10000), // minOrderSize
      ONE, // concentrationCoefScale
      0, // curveUpdateIntensity
      0, // ammJitIntensity
      "Dummy-PREDICTION-MARKET"
    );

    // Build the transaction
    console.log("Building transaction...");
    const tx = new Transaction();
    tx.add(ixs);
    tx.feePayer = keypair.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    console.log("Transaction built:");

    // Sign the transaction with all necessary signers
    tx.sign(keypair);
    
    // Send the transaction
    console.log("Sending transaction...");
    const txSig = await connection.sendTransaction(tx, [keypair], {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    // Wait for confirmation
    console.log("Waiting for confirmation...");
    await adminClient.connection.confirmTransaction(txSig);
    console.log("Transaction confirmed!", txSig);

    // Convert to prediction market
    const predictionIx = await adminClient.getInitializePredictionMarketIx(
      marketIndex
    );
    const predictionTx = new Transaction();
    predictionTx.add(predictionIx);
    predictionTx.feePayer = keypair.publicKey;
    predictionTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    console.log("Transaction built:");
    const predictionTxSig = await connection.sendTransaction(predictionTx, [keypair]);
    // Wait for confirmation
    console.log("Waiting for confirmation...");
    await adminClient.connection.confirmTransaction(predictionTxSig);
    console.log("Transaction confirmed!");
    
    console.log("Converted to prediction market:", predictionTxSig);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Unsubscribe when done
    await adminClient.unsubscribe();
  }
}

main().catch(console.error);

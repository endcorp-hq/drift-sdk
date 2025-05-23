import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { DriftClient, User } from "@drift-labs/sdk";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Connect to devnet
  const connection = new Connection("https://api.devnet.solana.com");

  // Load the keypair from file
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
      commitment: "confirmed",
    },
  });

  try {
    // Subscribe to the client
    await driftClient.subscribe();

    // Initialize user
    const ixs = await driftClient.getInitializeUserAccountIxs();
    const tx = new Transaction();
    tx.add(...ixs[0]);
    tx.feePayer = keypair.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const txSig = await connection.sendTransaction(tx, [keypair], {
      skipPreflight: true,
    });
    console.log("Waiting for confirmation...");
    await driftClient.connection.confirmTransaction(txSig);
    console.log("Transaction confirmed!");
    console.log("User created!", txSig);
  } catch (error) {
    console.error("Error initializing user:", error);
  } finally {
    // Cleanup
    await driftClient.unsubscribe();
  }
}

main().catch(console.error);

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, SendTransactionError } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { BN } from "bn.js";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Anchor instruction discriminator for "initialize"
const INITIALIZE_DISCRIMINATOR = Buffer.from([
  175, 175, 109, 31, 13, 152, 155, 237, // 8 bytes discriminator for "initialize"
]);

async function main() {
  // Connect to devnet
  const connection = new Connection("https://api.devnet.solana.com");

  // Load the keypair from file
  const keypairData = JSON.parse(
    fs.readFileSync(path.join(os.homedir(), process.env.ADMIN_PRIVATE_KEY_PATH!), "utf-8")
  );
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log("Your wallet public key:", keypair.publicKey.toBase58());

  // Program ID
  const programId = new PublicKey(process.env.PROGRAM_ID!);

  // USDC mint address on devnet
  const usdcMint = new PublicKey(process.env.USDC_MINT!);

  // Find PDA for drift_signer
  const [driftSigner, driftSignerNonce] = PublicKey.findProgramAddressSync(
    [Buffer.from("drift_signer")],
    programId
  );

  // Find PDA for state account
  const [stateAccount, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("drift_state")],
    programId
  );

  console.log("State Account:", stateAccount.toBase58());
  console.log("Drift Signer:", driftSigner.toBase58());

  // Create initialize instruction
  const initializeIx = {
    programId,
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true }, // admin
      { pubkey: stateAccount, isSigner: false, isWritable: true }, // state
      { pubkey: usdcMint, isSigner: false, isWritable: false }, // quote_asset_mint
      { pubkey: driftSigner, isSigner: false, isWritable: false }, // drift_signer
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // rent
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    ],
    data: INITIALIZE_DISCRIMINATOR, // Anchor instruction discriminator for "initialize"
  };

  // Build the transaction
  console.log("Building transaction...");
  const tx = new Transaction();
  tx.add(initializeIx);
  tx.feePayer = keypair.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  // Send the transaction
  console.log("Sending transaction...");
  try {
    const txSig = await connection.sendTransaction(tx, [keypair], {
      skipPreflight: false,
    });
    console.log("Transaction sent:", txSig);

    // Wait for confirmation
    console.log("Waiting for confirmation...");
    const confirmation = await connection.confirmTransaction(txSig);
    console.log("Transaction confirmed!", confirmation);
    console.log("Program initialized successfully!");
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof SendTransactionError && error.logs) {
      console.error("Transaction logs:", error.logs);
    }
    throw error;
  }
}

main().catch(console.error); 
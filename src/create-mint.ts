import { createInitializeMintInstruction, createMintToInstruction, getMinimumBalanceForRentExemptMint, MintLayout, TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { Connection, Keypair, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

async function mockUSDCMint(){
	let fakeUSDCMint: Keypair;
	
	fakeUSDCMint = Keypair.generate();
    const connection = new Connection("https://api.devnet.solana.com");

    const keypairData = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../keypair.json"), "utf-8")
    );
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log("Your wallet public key:", keypair.publicKey.toBase58());
	
	const createUSDCMintAccountIx = SystemProgram.createAccount({
		fromPubkey: keypair.publicKey,
		newAccountPubkey: fakeUSDCMint.publicKey,
		lamports: await getMinimumBalanceForRentExemptMint(connection),
		space: MintLayout.span,
		programId: TOKEN_PROGRAM_ID,
	});
	const initCollateralMintIx = createInitializeMintInstruction(
		fakeUSDCMint.publicKey,
		6,
		keypair.publicKey,
		keypair.publicKey
	);

	const fakeUSDCTx = new Transaction();
	fakeUSDCTx.add(createUSDCMintAccountIx);
	fakeUSDCTx.add(initCollateralMintIx);

    console.log("Sending transaction...");
	const sig = await sendAndConfirmTransaction(
		connection,
		fakeUSDCTx,
		[keypair, fakeUSDCMint],
		{
			skipPreflight: false,
			commitment: 'confirmed',
			preflightCommitment: 'confirmed',
		}
	);

	console.log("Mint created", sig);

    // Get associated token account address
    const associatedTokenAccount = await getAssociatedTokenAddress(
        fakeUSDCMint.publicKey,
        keypair.publicKey
    );

    // Create associated token account
    const createAtaIx = createAssociatedTokenAccountInstruction(
        keypair.publicKey,
        associatedTokenAccount,
        keypair.publicKey,
        fakeUSDCMint.publicKey
    );

    // Mint tokens to the associated token account
	const mintToIx = createMintToInstruction(
		fakeUSDCMint.publicKey,
		associatedTokenAccount,
		keypair.publicKey,
		1000000000000 // 1 million USDC (with 6 decimals)
	);

	const tx = new Transaction();
	tx.add(createAtaIx);
	tx.add(mintToIx);

    console.log("Creating token account and minting tokens...");
	await sendAndConfirmTransaction(
		connection,
		tx,
		[keypair],
		{
			skipPreflight: false,
			commitment: 'confirmed',
			preflightCommitment: 'confirmed',
		}
	);

    console.log("Token account created and tokens minted successfully!");
    console.log("Mint address:", fakeUSDCMint.publicKey.toBase58());
    console.log("Your token account:", associatedTokenAccount.toBase58());

	return fakeUSDCMint;
}

mockUSDCMint();
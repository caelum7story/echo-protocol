import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {Wallet} from 'ethers';

const schema = 'echo-launch-bsc97-test-wallet/v1';
const helper = path.resolve(import.meta.dirname, '../scripts/testnet-wallet-dpapi.ps1');
function dpapi(action, input) {
  if (process.platform !== 'win32') throw Error('TEST_WALLET_WINDOWS_DPAPI_REQUIRED');
  const executable = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const child = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-File', helper, '-Action', action], {
    input, encoding:'utf8', windowsHide:true, timeout:15000, maxBuffer:65536
  });
  // Never include child input, stdout, stderr or exception details in diagnostics.
  if (child.error || child.status !== 0 || !child.stdout?.trim()) throw Error('TEST_WALLET_DPAPI_FAILED');
  return child.stdout.trim();
}
export async function testWalletInfo(directory) {
  const value = JSON.parse(await fs.readFile(path.join(directory, 'public.json'), 'utf8'));
  if (value.schema !== schema || value.chainId !== 97 || value.mainnetUseAllowed !== false || !/^0x[0-9a-fA-F]{40}$/.test(value.address)) throw Error('TEST_WALLET_SCOPE');
  return value;
}
export async function verifyTestWallet(directory) {
  const info = await testWalletInfo(directory);
  const encrypted = await fs.readFile(path.join(directory, 'key.dpapi'), 'utf8');
  let secret = dpapi('unprotect', encrypted);
  try {
    if (new Wallet(secret).address !== info.address) throw Error('TEST_WALLET_KEY_MISMATCH');
    return {...info, localDecryptAndAddressVerified:true, privateKeyDisclosed:false};
  } finally { secret = ''; }
}
export async function createTestWallet(directory) {
  const target = path.resolve(directory);
  await fs.mkdir(path.dirname(target), {recursive:true});
  try { await fs.stat(target); throw Error('TEST_WALLET_DIRECTORY_EXISTS'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const staging = target + '.staging-' + randomBytes(8).toString('hex');
  await fs.mkdir(staging, {mode:0o700});
  const wallet = Wallet.createRandom();
  const encrypted = dpapi('protect', wallet.privateKey);
  await fs.writeFile(path.join(staging, 'key.dpapi'), encrypted + '\n', {flag:'wx', mode:0o600});
  const info = {schema, createdAt:new Date().toISOString(), chainId:97, address:wallet.address,
    purpose:'Independent ECHO Launch public-testnet rehearsal; test tokens only',
    protection:'Windows DPAPI CurrentUser; requires this Windows account and profile',
    mainnetUseAllowed:false, seedPhraseExported:false, privateKeyDisclosed:false,
    backupVerified:false, testnetTransactionAuthorization:false};
  await fs.writeFile(path.join(staging, 'public.json'), JSON.stringify(info,null,2)+'\n', {flag:'wx'});
  await verifyTestWallet(staging);
  await fs.rename(staging, target);
  return {...info, localDecryptAndAddressVerified:true};
}

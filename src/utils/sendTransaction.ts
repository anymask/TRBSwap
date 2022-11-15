import { BigNumber } from '@ethersproject/bignumber'
import { TransactionResponse } from '@ethersproject/providers'
import { t } from '@lingui/macro'
import { captureException } from '@sentry/react'
import { SignerWalletAdapter } from '@solana/wallet-adapter-base'
import { Transaction, VersionedTransaction } from '@solana/web3.js'
import { ethers } from 'ethers'

import connection from 'state/connection/connection'
import { TransactionHistory } from 'state/transactions/hooks'
import { TRANSACTION_TYPE } from 'state/transactions/type'
// import connection from 'state/connection/connection'
import { calculateGasMargin } from 'utils'

import { Aggregator } from './aggregator'

export async function sendEVMTransaction(
  account: string,
  library: ethers.providers.Web3Provider | undefined,
  contractAddress: string,
  encodedData: string,
  value: BigNumber,
  handler?: (response: TransactionResponse) => void,
): Promise<string | undefined> {
  if (!account || !library) return

  const estimateGasOption = {
    from: account,
    to: contractAddress,
    data: encodedData,
    value,
  }

  let gasEstimate: ethers.BigNumber | undefined
  try {
    gasEstimate = await library.getSigner().estimateGas(estimateGasOption)
    if (!gasEstimate) throw new Error('gasEstimate is nullish value')
  } catch (error) {
    const e = new Error('Swap failed', { cause: error })
    e.name = 'SwapError'

    const tmp = JSON.stringify(error)
    const tag = tmp.includes('minTotalAmountOut')
      ? 'minTotalAmountOut'
      : tmp.includes('ERR_LIMIT_OUT')
      ? 'ERR_LIMIT_OUT'
      : tmp.toLowerCase().includes('1inch')
      ? 'call1InchFailed'
      : 'other'

    captureException(e, {
      level: 'fatal',
      extra: estimateGasOption,
      tags: {
        type: tag,
      },
    })

    throw new Error('gasEstimate not found: Unexpected error. Please contact support: none of the calls threw an error')
  }

  const sendTransactionOption = {
    from: account,
    to: contractAddress,
    data: encodedData,
    gasLimit: calculateGasMargin(gasEstimate),
    ...(value.eq('0') ? {} : { value }),
  }

  try {
    const response = await library.getSigner().sendTransaction(sendTransactionOption)
    handler?.(response)
    return response.hash
  } catch (error) {
    // if the user rejected the tx, pass this along
    if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
      throw new Error('Transaction rejected.')
    } else {
      const e = new Error('Swap failed', { cause: error })
      e.name = 'SwapError'

      const tmp = JSON.stringify(error)
      const tag = tmp.includes('minTotalAmountOut')
        ? 'minTotalAmountOut'
        : tmp.includes('ERR_LIMIT_OUT')
        ? 'ERR_LIMIT_OUT'
        : tmp.toLowerCase().includes('1inch')
        ? 'call1InchFailed'
        : 'other'

      captureException(e, {
        level: 'error',
        extra: sendTransactionOption,
        tags: {
          type: tag,
        },
      })

      // Otherwise, the error was unexpected, and we need to convey that.
      throw new Error(error)
    }
  }
}

const getInspectTxSolanaUrl = (tx: Transaction | VersionedTransaction | undefined | null) => {
  if (!tx) return ''
  if ('serializeMessage' in tx) return Buffer.concat([Buffer.from([0]), tx.serializeMessage()]).toString('base64')
  if ('serialize' in tx) return Buffer.from(tx.serialize()).toString('base64')
  return ''
}

export async function sendSolanaTransactions(
  trade: Aggregator,
  solanaWallet: SignerWalletAdapter,
  handler: (hash: string, firstTxHash: string) => void,
  addTransactionWithType: (tx: TransactionHistory) => void,
): Promise<string[] | undefined> {
  const swap = trade.solana?.swap
  if (!swap) return
  if (swap === 'loading') return
  if (!swap.swapTx) return

  const txs: (Transaction | VersionedTransaction)[] = []

  if (swap.setupTx) {
    txs.push(swap.setupTx)
  }

  txs.push(swap.swapTx)

  if (swap.cleanUpTx) {
    txs.push(swap.cleanUpTx)
  }

  const populateTx = (
    txs: (Transaction | VersionedTransaction)[],
  ): {
    signedSetupTx: Transaction | undefined
    signedSwapTx: VersionedTransaction
    signedCleanUpTx: Transaction | undefined
  } => {
    const result: {
      signedSetupTx: Transaction | undefined
      signedSwapTx: VersionedTransaction | undefined
      signedCleanUpTx: Transaction | undefined
    } = { signedSetupTx: undefined, signedSwapTx: undefined, signedCleanUpTx: undefined }
    let count = 0
    if (swap.setupTx) result.signedSetupTx = txs[count++] as Transaction
    result.signedSwapTx = txs[count++] as VersionedTransaction
    result.signedCleanUpTx = txs[count++] as Transaction
    return result as {
      signedSetupTx: Transaction | undefined
      signedSwapTx: VersionedTransaction
      signedCleanUpTx: Transaction | undefined
    }
  }

  console.group('Sending transactions:')
  swap.setupTx && console.info('setup tx:', getInspectTxSolanaUrl(swap.setupTx))
  console.info('swap tx:', getInspectTxSolanaUrl(swap.swapTx))
  swap.cleanUpTx && console.info('clean up tx:', getInspectTxSolanaUrl(swap.cleanUpTx))
  console.info('inspector: https://explorer.solana.com/tx/inspector')
  console.groupEnd()

  try {
    let signedTxs: (Transaction | VersionedTransaction)[]
    try {
      signedTxs = await (solanaWallet as SignerWalletAdapter).signAllTransactions(txs)
    } catch (e) {
      console.log({ e })
      throw e
    }
    const { signedSetupTx, signedSwapTx, signedCleanUpTx } = populateTx(signedTxs)
    const txHashs: string[] = []
    let setupHash: string
    if (signedSetupTx) {
      try {
        setupHash = await connection.sendRawTransaction(signedSetupTx.serialize())
        txHashs.push(setupHash)
        addTransactionWithType({
          type: TRANSACTION_TYPE.SETUP,
          hash: setupHash,
          firstTxHash: txHashs[0],
          arbitrary: {
            index: 1,
            total: signedTxs.length,
            leadTx: {
              summary: '',
              type: '',
            },
          },
        })
      } catch (error) {
        console.error({ error })
        throw new Error('Set up error' + (error.message ? ': ' + error.message : ''))
      }

      try {
        await connection.confirmTransaction(setupHash)
      } catch (error) {
        console.error({ error })
        throw new Error('Set up error' + (error.message ? ': ' + error.message : ''))
      }
    }

    let swapHash: string
    try {
      swapHash = await connection.sendRawTransaction(Buffer.from(signedSwapTx.serialize()))
      txHashs.push(swapHash)
      handler(swapHash, txHashs[0])
    } catch (error) {
      console.error({ error })
      if (error?.message?.endsWith('0x1771')) {
        throw new Error(t`An error occurred. Try refreshing the price rate or increase max slippage`)
      }
      throw error
    }

    if (signedCleanUpTx) {
      try {
        await connection.confirmTransaction(swapHash)
      } catch (error) {
        console.error({ error })
        if (error?.message?.endsWith('0x1771')) {
          throw new Error(t`An error occurred. Try refreshing the price rate or increase max slippage`)
        }
        throw error
      }
      try {
        const cleanUpHash = await connection.sendRawTransaction(signedCleanUpTx.serialize())
        txHashs.push(cleanUpHash)
        addTransactionWithType({
          type: TRANSACTION_TYPE.CLEANUP,
          hash: cleanUpHash,
          firstTxHash: txHashs[0],
          arbitrary: {
            index: 3,
            total: signedTxs.length,
            leadTx: {},
          },
        })
      } catch (error) {
        console.error({ error })
        throw new Error('Clean up error' + (error.message ? ': ' + error.message : ''))
      }
    }
    return txHashs
  } catch (e) {
    throw e
  }
}

import { ethereum } from "@graphprotocol/graph-ts"
import { Deposit, Withdraw } from '../generated/Stk2Pi/Stk2Pi'
import { STK_PI_ADDRESS, } from './constants' // Removed BIG_INT_1
import { idForEvent, saveHolder, createKind, updateBundleCounter } from './helpers' // Removed getBundle, added updateBundleCounter
// import { log } from '@graphprotocol/graph-ts'

export function handleDeposit(event: Deposit): void {
  createKind(event, "Deposit", STK_PI_ADDRESS)

  updateBundleCounter("deposits")

  saveHolder(event.params.user.toHex())
}


export function handleWithdraw(event: Withdraw): void {
  createKind(event, "Withdraw", STK_PI_ADDRESS)

  updateBundleCounter("withdraws")

  saveHolder(event.params.user.toHex())
}

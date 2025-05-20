import { ethereum } from "@graphprotocol/graph-ts"
import { Deposit, EmergencyWithdraw, Harvested, Withdraw } from '../generated/Archimedes/Archimedes'
import { ARCHIMEDES_ADDRESS, } from './constants' // Removed BIG_INT_1
import { idForEvent, saveHolder, createKind, updateBundleCounter } from './helpers' // Removed getBundle, added updateBundleCounter
// import { log } from '@graphprotocol/graph-ts'

export function handleDeposit(event: Deposit): void {
  createKind(event, "Deposit", ARCHIMEDES_ADDRESS)

  updateBundleCounter("deposits")

  // PiToken rewards
  saveHolder(event.params.user.toHex())
}

export function handleWithdraw(event: Withdraw): void {
  createKind(event, "Withdraw", ARCHIMEDES_ADDRESS)

  updateBundleCounter("withdraws")

  // PiToken rewards
  saveHolder(event.params.user.toHex())
}

export function handleEmergencyWithdraw(event: EmergencyWithdraw): void {
  createKind(event, "Withdraw", ARCHIMEDES_ADDRESS)

  updateBundleCounter("withdraws")
}

export function handleHarvest(event: Harvested): void {
  let user = saveHolder(event.params.user.toHex())

  // user can be null in other cases
  if (user) {
    user.harvested = user.harvested.plus(event.params.amount)
    user.save()
  }
}

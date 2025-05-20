import { Address, BigInt, BigDecimal, ethereum } from "@graphprotocol/graph-ts"
import { Holder, Bundle, Movement } from '../generated/schema'
import { LP as ILP } from '../generated/Distributor/LP'
import { ERC20 as IERC20 } from '../generated/Distributor/ERC20'
import { IChainlink } from '../generated/Distributor/IChainlink'
import {
  BIG_DECIMAL_0,
  BIG_DECIMAL_1E18,
  BIG_INT_0,
  BIG_INT_1,
  IPiToken,
  IStk2Pi,
  WETH_USD_LP,
  WETH_ADDRESS,
  PI_WETH_LP,
  PI_TOKEN_ADDRESS,
  ILPFactory,
  ZERO_ADDRESS,
  ChainLinkOracles,
} from './constants'
import { log } from '@graphprotocol/graph-ts'


export function getFullBalance(addr: String): BigInt {
  const mantisa = BigInt.fromString(BIG_DECIMAL_1E18.toString())
  const address = Address.fromString(addr)

  const balanceResult = IStk2Pi.try_balanceOf(address)

  let stkBalance = BIG_INT_0
  let pricePerShare = mantisa

  if (!balanceResult.reverted) {
    stkBalance = balanceResult.value
    pricePerShare = IStk2Pi.getPricePerFullShare()
  }

  return IPiToken.balanceOf(address).plus(
    stkBalance.times(pricePerShare).div(
      mantisa
    )
  )
}

export function getBundle(): Bundle {
  let bundle = Bundle.load('0')
  if (bundle === null) {
    bundle = new Bundle('0')
    bundle.save()
  }

  return bundle
}

export function saveHolder(addr: String): (Holder | null) {
  if (addr == IPiToken._address.toHex()) {
    return null
  }

  let bundle = getBundle()
  let user = Holder.load(addr)
  let balance = getFullBalance(addr)

  if (user === null) {
    user = new Holder(addr)

    // that's a new user so we have to increase holders
    bundle.holdersCount = bundle.holdersCount.plus(BIG_INT_1)
    bundle.save()
  } else if (balance == BIG_INT_0) {
    // If balance == 0 the holder is already registerd so it should
    // ALWAYS exist as holder. So the only way to get balance 0
    // is to have been a holder and now transfer/to other
    bundle.holdersCount = bundle.holdersCount.minus(BIG_INT_1)
    bundle.save()
  }

  user.bundle = bundle.id
  user.amount = balance
  user.save()

  return user
}

export function idForEvent(event: ethereum.Event): String {
  return `${event.transaction.hash.toHex()}:${event.logIndex.toString()}`
}

export function ethUSDPrice(): BigDecimal {
  let ethUsd = ILP.bind(WETH_USD_LP)
  let reservesCall = ethUsd.try_getReserves()

  if (reservesCall.reverted) {
    // Use the DAI LP (8400~3100 usd)
    ethUsd = ILP.bind(Address.fromString('0x20824aE16C7d601723d3b11473818AE5a04051C0'))
    reservesCall = ethUsd.try_getReserves()
  }

  const reserves = reservesCall.value
  const reserve0 = reserves.value0.toBigDecimal().times(BIG_DECIMAL_1E18)
  const reserve1 = reserves.value1.toBigDecimal().times(BIG_DECIMAL_1E18)
  let tokenPrecision: BigDecimal
  let ratio: BigDecimal

  // WETH always use 18 decimals precision
  if (ethUsd.token0() == WETH_ADDRESS) {
    tokenPrecision = BigDecimal.fromString(
      '1' + '0'.repeat(IERC20.bind(ethUsd.token1()).decimals())
    )

    ratio = reserve1.div(reserve0)
  } else {
    tokenPrecision = BigDecimal.fromString(
      '1' + '0'.repeat(IERC20.bind(ethUsd.token0()).decimals())
    )

    ratio = reserve0.div(reserve1)
  }

  return ratio.times(BIG_DECIMAL_1E18).div(tokenPrecision)
}

export function ethPerToken(lp: ILP): BigDecimal {
  const reservesCall = lp.try_getReserves()

  if (reservesCall.reverted) { return BIG_DECIMAL_0 }

  const reserves = reservesCall.value

  let eth =
    lp.token0() == WETH_ADDRESS
      ? reserves.value0.toBigDecimal().times(BIG_DECIMAL_1E18).div(reserves.value1.toBigDecimal())
      : reserves.value1.toBigDecimal().times(BIG_DECIMAL_1E18).div(reserves.value0.toBigDecimal())

  // let name = [IERC20.bind(lp.token1()).symbol(), IERC20.bind(lp.token0()).symbol()].join('-')

  return eth.div(BIG_DECIMAL_1E18)
}

export function lpPrice(lpAddr: Address): BigDecimal {
  if (lpAddr == ZERO_ADDRESS) { return BIG_DECIMAL_0 }

  const lp = ILP.bind(lpAddr)

  if (lp.token0() == WETH_ADDRESS || lp.token1() == WETH_ADDRESS) {
    return tokenPriceFromLP(lp)
  } else {
    const token0EthLP = getTokenWETHLP(lp.token0())
    const token1EthLP = getTokenWETHLP(lp.token1())

    const price = lpPrice(token0EthLP).plus(lpPrice(token1EthLP))

    return price
  }
}

export function tokenPriceFromLP(lp: ILP): BigDecimal {
  return ethUSDPrice().times(ethPerToken(lp))
}

export function piPrice(): BigDecimal {
  const lp = ILP.bind(PI_WETH_LP)
  return ethUSDPrice().times(ethPerToken(lp))
}

export function getPriceFromChainlink(addr: Address): BigDecimal | null {
  let oracleAddr: Address | null = ChainLinkOracles.get(addr)

  if (oracleAddr === null) { return null }

  let oracle = IChainlink.bind(oracleAddr)
  let oraclePrecision =  BigDecimal.fromString('1' + '0'.repeat(oracle.decimals()))

  // value1 is the `answer` attr
  return oracle.latestRoundData().value1.toBigDecimal().div(oraclePrecision)
}


export function getTokenWETHLP(addr: Address): Address {
  return ILPFactory.getPair(addr, WETH_ADDRESS)
}

export function getPrice(addr: Address): BigDecimal {
  // First try to check for Chainlink oracle price
  let oraclePrice: BigDecimal | null = getPriceFromChainlink(addr)
  if (oraclePrice) { return oraclePrice }

  let lpAddr = addr

  // try LP
  const reservesCall = ILP.bind(addr).try_getReserves()

  // Try get LP for single token
  if (reservesCall.reverted) { lpAddr = getTokenWETHLP(addr) }

  return lpPrice(lpAddr)
}

export function createKind(event: ethereum.Event, kind: String, contractAddress: Address): void {
  const id = `${contractAddress.toHex()}:${idForEvent(event)}`
  let mov = new Movement(id)

  mov.kind = kind
  mov.timestamp = event.block.timestamp
  mov.blockNumber = event.block.number
  mov.transactionHash = event.transaction.hash

  mov.save()
}

export function updateBundleCounter(field: String): void {
  const bundle = getBundle()

  if (field == "deposits") {
    bundle.deposits = bundle.deposits.plus(BIG_INT_1)
  } else if (field == "withdraws") {
    bundle.withdraws = bundle.withdraws.plus(BIG_INT_1)
  }
  // Add more fields here if needed in the future
  // else {
  //   log.warning("updateBundleCounter: Unknown field '{}'", [field.toString()])
  //   return // Do not save if field is unknown
  // }

  bundle.save()
}

export enum Timeframe {
  M1 = '1m',
  M5 = '5m',
  M15 = '15m',
  M30 = '30m',
  H1 = '1h',
  H4 = '4h',
  D1 = '1d',
}

export enum Side {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum Decision {
  BUY = 'BUY',
  SELL = 'SELL',
  NO_TRADE = 'NO_TRADE',
}

export enum SignalStatus {
  RANKED = 'ranked',
  WATCHING = 'watching',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  EXECUTED = 'executed',
}

export enum TradeStatus {
  PENDING = 'pending',
  OPEN = 'open',
  PARTIALLY_FILLED = 'partially_filled',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum PositionStatus {
  OPEN = 'open',
  CLOSING = 'closing',
  CLOSED = 'closed',
}

export enum TradingMode {
  PAPER = 'paper',
  LIVE = 'live',
}

export enum ApprovalMode {
  MANUAL = 'manual',
  SEMI = 'semi',
  AUTO = 'auto',
}

export enum MarketRegime {
  TRENDING_BULL = 'trending_bull',
  TRENDING_BEAR = 'trending_bear',
  RANGING = 'ranging',
  VOLATILE = 'volatile',
  COMPRESSION = 'compression',
  TRENDING_VOLATILE = 'trending_volatile',
  UNKNOWN = 'unknown',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum NotificationChannel {
  TELEGRAM = 'telegram',
  DISCORD = 'discord',
  EMAIL = 'email',
  BROWSER = 'browser',
}

export enum NotificationType {
  TRADE_SIGNAL = 'trade_signal',
  TRADE_EXECUTED = 'trade_executed',
  TRADE_CLOSED = 'trade_closed',
  RISK_ALERT = 'risk_alert',
  PROFIT_HIGH = 'profit_high',
  PROFIT_LOW = 'profit_low',
  ERROR = 'error',
}

/** In-app path to open when the user taps a Web Push notification. */
export function notificationPathForType(type: NotificationType | string): string {
  switch (type) {
    case NotificationType.TRADE_SIGNAL:
      return '/signals';
    case NotificationType.TRADE_EXECUTED:
    case NotificationType.TRADE_CLOSED:
      return '/trades';
    case NotificationType.PROFIT_HIGH:
    case NotificationType.PROFIT_LOW:
      return '/portfolio';
    case NotificationType.RISK_ALERT:
      return '/settings';
    default:
      return '/';
  }
}

export const TIMEFRAMES = Object.values(Timeframe);

export const STRATEGY_IDS = [
  'ema_pullback',
  'ema_cross',
  'macd_momentum',
  'rsi_pullback',
  'vwap_reversion',
  'atr_trend',
  'supertrend',
  'bollinger_reversal',
  'breakout',
  'trend_continuation',
  'support_bounce',
  'resistance_rejection',
  'break_of_structure',
  'change_of_character',
  'order_block',
  'fair_value_gap',
  'liquidity_sweep',
  'volume_breakout',
  'bb_squeeze_breakout',
  'stoch_rsi_reversion',
  'ichimoku_trend',
  'pivot_bounce',
  'rsi_divergence',
  'donchian_volume',
  'adx_ignition',
  'macd_divergence',
  'inside_bar_nr7',
] as const;

export type StrategyId = (typeof STRATEGY_IDS)[number];

export const LEVERAGED_TOKEN_DENYLIST = [
  'UPUSDT',
  'DOWNUSDT',
  'BULLUSDT',
  'BEARUSDT',
];

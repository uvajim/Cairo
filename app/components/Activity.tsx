import { ArrowUpRight, ArrowDownLeft, Droplet, CheckCircle, Clock } from 'lucide-react';

const transactions = [
  {
    id: '1',
    type: 'trade',
    from: { symbol: 'ETH', amount: 0.5, assetType: 'crypto' },
    to: { symbol: 'AAPL', amount: 7.07, assetType: 'stock' },
    timestamp: '2 hours ago',
    status: 'completed',
    hash: '0x1234...5678'
  },
  {
    id: '2',
    type: 'trade',
    from: { symbol: 'TSLA', amount: 5, assetType: 'stock' },
    to: { symbol: 'BTC', amount: 0.0131, assetType: 'crypto' },
    timestamp: '5 hours ago',
    status: 'completed',
    hash: '0xabcd...efgh'
  },
  {
    id: '3',
    type: 'add_liquidity',
    from: { symbol: 'UNI', amount: 50, assetType: 'crypto' },
    to: { symbol: 'ETH', amount: 0.15, assetType: 'crypto' },
    pool: 'UNI/ETH',
    timestamp: '8 hours ago',
    status: 'completed',
    hash: '0x9876...4321'
  },
  {
    id: '4',
    type: 'trade',
    from: { symbol: 'NVDA', amount: 2, assetType: 'stock' },
    to: { symbol: 'ETH', amount: 0.553, assetType: 'crypto' },
    timestamp: '1 day ago',
    status: 'completed',
    hash: '0xfedc...ba98'
  },
  {
    id: '5',
    type: 'trade',
    from: { symbol: 'USDC', amount: 5000, assetType: 'crypto' },
    to: { symbol: 'MSFT', amount: 11.63, assetType: 'stock' },
    timestamp: '1 day ago',
    status: 'pending',
    hash: '0x1111...2222'
  },
  {
    id: '6',
    type: 'trade',
    from: { symbol: 'GOOGL', amount: 10, assetType: 'stock' },
    to: { symbol: 'SOL', amount: 12.69, assetType: 'crypto' },
    timestamp: '2 days ago',
    status: 'completed',
    hash: '0x3333...4444'
  },
  {
    id: '7',
    type: 'remove_liquidity',
    from: { symbol: 'DAI', amount: 1200, assetType: 'crypto' },
    to: { symbol: 'USDC', amount: 1200, assetType: 'crypto' },
    pool: 'DAI/USDC',
    timestamp: '3 days ago',
    status: 'completed',
    hash: '0x5555...6666'
  },
];

export function Activity() {
  const getIcon = (type: string, status: string) => {
    if (status === 'pending') {
      return <Clock className="w-5 h-5 text-yellow-500" />;
    }
    
    switch (type) {
      case 'trade':
        return <ArrowUpRight className="w-5 h-5 text-purple-400" />;
      case 'add_liquidity':
        return <Droplet className="w-5 h-5 text-blue-400" />;
      case 'remove_liquidity':
        return <ArrowDownLeft className="w-5 h-5 text-orange-400" />;
      default:
        return <CheckCircle className="w-5 h-5 text-green-400" />;
    }
  };

  const getTypeLabel = (type: string, tx: any) => {
    switch (type) {
      case 'trade':
        const isCrossTrade = tx.from.assetType !== tx.to.assetType;
        if (isCrossTrade) {
          return tx.from.assetType === 'stock' ? 'Stock → Crypto' : 'Crypto → Stock';
        }
        return tx.from.assetType === 'stock' ? 'Stock Trade' : 'Crypto Swap';
      case 'add_liquidity':
        return 'Add Liquidity';
      case 'remove_liquidity':
        return 'Remove Liquidity';
      default:
        return type;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2">Activity</h2>
        <p className="text-gray-400">Your transaction history</p>
      </div>

      <div className="bg-[#1A1B1F] rounded-2xl overflow-hidden">
        <div className="divide-y divide-gray-800">
          {transactions.map((tx) => (
            <div key={tx.id} className="p-6 hover:bg-gray-800/50 transition-colors">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="mt-1">
                  {getIcon(tx.type, tx.status)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="font-semibold mb-1">{getTypeLabel(tx.type, tx)}</p>
                      <div className="flex items-center gap-2 text-sm flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          tx.from.assetType === 'stock' 
                            ? 'bg-blue-500/20 text-blue-400' 
                            : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {tx.from.symbol}
                        </span>
                        <span className="text-gray-400">
                          {tx.from.amount}
                        </span>
                        <ArrowUpRight className="w-3 h-3 text-gray-500" />
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          tx.to.assetType === 'stock' 
                            ? 'bg-blue-500/20 text-blue-400' 
                            : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {tx.to.symbol}
                        </span>
                        <span className="text-gray-400">
                          {tx.to.amount}
                        </span>
                      </div>
                      {tx.pool && (
                        <p className="text-sm text-gray-500 mt-1">Pool: {tx.pool}</p>
                      )}
                    </div>

                    <div className="text-right">
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium mb-1 ${
                        tx.status === 'completed' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {tx.status === 'completed' ? (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            Completed
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            Pending
                          </>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">{tx.timestamp}</p>
                    </div>
                  </div>

                  <a
                    href={`https://etherscan.io/tx/${tx.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-purple-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1"
                  >
                    {tx.hash}
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
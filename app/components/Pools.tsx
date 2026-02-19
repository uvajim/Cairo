import { Plus, TrendingUp } from 'lucide-react';

const pools = [
  { 
    pair: 'ETH/USDC', 
    tvl: 245600000, 
    volume24h: 52300000, 
    fees24h: 156900, 
    apr: 24.5,
    yourLiquidity: 12450.50
  },
  { 
    pair: 'UNI/ETH', 
    tvl: 128400000, 
    volume24h: 18700000, 
    fees24h: 56100, 
    apr: 18.2,
    yourLiquidity: 0
  },
  { 
    pair: 'LINK/ETH', 
    tvl: 89200000, 
    volume24h: 12400000, 
    fees24h: 37200, 
    apr: 15.8,
    yourLiquidity: 3240.75
  },
  { 
    pair: 'AAVE/ETH', 
    tvl: 67800000, 
    volume24h: 8900000, 
    fees24h: 26700, 
    apr: 21.3,
    yourLiquidity: 0
  },
  { 
    pair: 'DAI/USDC', 
    tvl: 198500000, 
    volume24h: 45200000, 
    fees24h: 135600, 
    apr: 8.4,
    yourLiquidity: 5680.20
  },
];

export function Pools() {
  const totalLiquidity = pools.reduce((sum, pool) => sum + pool.yourLiquidity, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Your Liquidity */}
      <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 mb-2">Your Total Liquidity</p>
            <h2 className="text-4xl font-bold mb-1">
              ${totalLiquidity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <p className="text-sm text-gray-400">Across {pools.filter(p => p.yourLiquidity > 0).length} pools</p>
          </div>
          <button className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Liquidity
          </button>
        </div>
      </div>

      {/* Pools List */}
      <div className="bg-[#1A1B1F] rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-lg font-semibold">Top Pools</h3>
        </div>
        
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-6 gap-4 px-6 py-4 border-b border-gray-800 text-sm text-gray-400">
          <div>Pool</div>
          <div className="text-right">TVL</div>
          <div className="text-right">24h Volume</div>
          <div className="text-right">24h Fees</div>
          <div className="text-right">APR</div>
          <div className="text-right">Your Liquidity</div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-gray-800">
          {pools.map((pool) => (
            <div
              key={pool.pair}
              className="grid grid-cols-1 md:grid-cols-6 gap-4 p-6 hover:bg-gray-800/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center border-2 border-[#1A1B1F] text-sm font-bold">
                    {pool.pair.split('/')[0].slice(0, 1)}
                  </div>
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center border-2 border-[#1A1B1F] text-sm font-bold">
                    {pool.pair.split('/')[1].slice(0, 1)}
                  </div>
                </div>
                <div>
                  <p className="font-semibold">{pool.pair}</p>
                  <p className="text-sm text-gray-400 md:hidden">
                    ${(pool.tvl / 1000000).toFixed(1)}M TVL
                  </p>
                </div>
              </div>

              <div className="flex md:block justify-between items-center">
                <span className="text-gray-400 md:hidden text-sm">TVL:</span>
                <p className="text-right font-medium">
                  ${(pool.tvl / 1000000).toFixed(1)}M
                </p>
              </div>

              <div className="flex md:block justify-between items-center">
                <span className="text-gray-400 md:hidden text-sm">24h Volume:</span>
                <p className="text-right font-medium">
                  ${(pool.volume24h / 1000000).toFixed(1)}M
                </p>
              </div>

              <div className="flex md:block justify-between items-center">
                <span className="text-gray-400 md:hidden text-sm">24h Fees:</span>
                <p className="text-right font-medium">
                  ${(pool.fees24h / 1000).toFixed(1)}K
                </p>
              </div>

              <div className="flex md:block justify-between items-center">
                <span className="text-gray-400 md:hidden text-sm">APR:</span>
                <div className="flex items-center justify-end gap-1 text-green-500 font-medium">
                  <TrendingUp className="w-4 h-4" />
                  {pool.apr}%
                </div>
              </div>

              <div className="flex md:block justify-between items-center">
                <span className="text-gray-400 md:hidden text-sm">Your Liquidity:</span>
                <p className="text-right font-medium">
                  {pool.yourLiquidity > 0 ? (
                    <span className="text-purple-400">
                      ${pool.yourLiquidity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

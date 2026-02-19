import { useState } from 'react';
import { ArrowDown, Settings, Info, Search } from 'lucide-react';

const stocks = [
  { symbol: 'AAPL', name: 'Apple Inc.', balance: 25, price: 227.50, type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', balance: 15, price: 262.50, type: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', balance: 8, price: 890.00, type: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', balance: 12, price: 430.00, type: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', balance: 30, price: 165.00, type: 'stock' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', balance: 0, price: 218.50, type: 'stock' },
  { symbol: 'META', name: 'Meta Platforms, Inc.', balance: 0, price: 638.00, type: 'stock' },
];

const crypto = [
  { symbol: 'BTC', name: 'Bitcoin', balance: 0.125, price: 100500.00, type: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', balance: 2.5634, price: 3216.45, type: 'crypto' },
  { symbol: 'USDC', name: 'USD Coin', balance: 15420.50, price: 1.00, type: 'crypto' },
  { symbol: 'UNI', name: 'Uniswap', balance: 450.25, price: 10.00, type: 'crypto' },
  { symbol: 'SOL', name: 'Solana', balance: 45.50, price: 130.00, type: 'crypto' },
  { symbol: 'LINK', name: 'Chainlink', balance: 125.00, price: 17.00, type: 'crypto' },
  { symbol: 'AAVE', name: 'Aave', balance: 15.75, price: 95.00, type: 'crypto' },
];

const allAssets = [...stocks, ...crypto];

export function Swap() {
  const [fromAsset, setFromAsset] = useState(allAssets[1]); // ETH
  const [toAsset, setToAsset] = useState(stocks[0]); // AAPL
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [showFromSelect, setShowFromSelect] = useState(false);
  const [showToSelect, setShowToSelect] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'stocks' | 'crypto'>('all');

  const filteredAssets = allAssets.filter(asset => {
    const matchesSearch = asset.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         asset.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === 'all' || asset.type === activeTab;
    return matchesSearch && matchesTab;
  });

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value);
    if (value) {
      const calculated = (parseFloat(value) * fromAsset.price / toAsset.price).toFixed(6);
      setToAmount(calculated);
    } else {
      setToAmount('');
    }
  };

  const handleSwapAssets = () => {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  const rate = fromAsset.price / toAsset.price;
  const fee = fromAmount ? (parseFloat(fromAmount) * fromAsset.price * 0.001).toFixed(2) : '0.00';
  const isCryptoSwap = fromAsset.type === 'crypto' && toAsset.type === 'crypto';

  return (
    <div className="max-w-xl mx-auto px-4 py-8 md:py-16">
      <div className="bg-[#1A1B1F] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Trade</h2>
          <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* From Asset */}
        <div className="bg-[#0D0E12] rounded-xl p-4 mb-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">You pay</span>
            <span className="text-sm text-gray-400">
              Balance: {fromAsset.balance.toFixed(4)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={fromAmount}
              onChange={(e) => handleFromAmountChange(e.target.value)}
              placeholder="0.0"
              className="flex-1 bg-transparent text-3xl font-medium outline-none"
            />
            <button
              onClick={() => setShowFromSelect(!showFromSelect)}
              className="flex items-center gap-2 bg-[#1A1B1F] hover:bg-gray-800 px-4 py-2 rounded-xl transition-colors"
            >
              <div className={`w-6 h-6 ${
                fromAsset.type === 'stock' 
                  ? 'bg-gradient-to-br from-blue-500 to-cyan-500' 
                  : 'bg-gradient-to-br from-purple-500 to-pink-500'
              } rounded-full flex items-center justify-center text-xs font-bold`}>
                {fromAsset.symbol.slice(0, 1)}
              </div>
              <span className="font-semibold">{fromAsset.symbol}</span>
            </button>
          </div>
          {fromAmount && (
            <p className="text-sm text-gray-400 mt-2">
              ≈ ${(parseFloat(fromAmount) * fromAsset.price).toFixed(2)}
            </p>
          )}
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center -my-2 relative z-10">
          <button
            onClick={handleSwapAssets}
            className="bg-[#1A1B1F] hover:bg-gray-800 p-2 rounded-xl border-4 border-[#0D0E12] transition-colors"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        </div>

        {/* To Asset */}
        <div className="bg-[#0D0E12] rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">You receive</span>
            <span className="text-sm text-gray-400">
              Balance: {toAsset.balance.toFixed(4)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={toAmount}
              readOnly
              placeholder="0.0"
              className="flex-1 bg-transparent text-3xl font-medium outline-none"
            />
            <button
              onClick={() => setShowToSelect(!showToSelect)}
              className="flex items-center gap-2 bg-[#1A1B1F] hover:bg-gray-800 px-4 py-2 rounded-xl transition-colors"
            >
              <div className={`w-6 h-6 ${
                toAsset.type === 'stock' 
                  ? 'bg-gradient-to-br from-blue-500 to-cyan-500' 
                  : 'bg-gradient-to-br from-purple-500 to-pink-500'
              } rounded-full flex items-center justify-center text-xs font-bold`}>
                {toAsset.symbol.slice(0, 1)}
              </div>
              <span className="font-semibold">{toAsset.symbol}</span>
            </button>
          </div>
          {toAmount && (
            <p className="text-sm text-gray-400 mt-2">
              ≈ ${(parseFloat(toAmount) * toAsset.price).toFixed(2)}
            </p>
          )}
        </div>

        {/* Trade Details */}
        {fromAmount && toAmount && (
          <div className="bg-[#0D0E12] rounded-xl p-4 mb-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Rate</span>
              <span>1 {fromAsset.symbol} = {rate.toFixed(6)} {toAsset.symbol}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Trading Fee {isCryptoSwap ? '(0.3%)' : '(0.1%)'}</span>
              <span>${fee}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Type</span>
              <span className="capitalize">{fromAsset.type} → {toAsset.type}</span>
            </div>
          </div>
        )}

        {/* Trade Button */}
        <button className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
          {!fromAmount ? 'Enter amount' : `Trade ${fromAsset.type === 'stock' ? 'Stock' : 'Crypto'}`}
        </button>

        {/* Info */}
        <div className="mt-4 flex items-start gap-2 text-sm text-gray-400">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            {isCryptoSwap 
              ? 'Crypto swaps are executed instantly with a 0.3% fee that goes to liquidity providers.'
              : 'Stock trades are commission-free with a 0.1% platform fee. Stocks execute during market hours.'}
          </p>
        </div>
      </div>

      {/* Asset Selection Modal */}
      {(showFromSelect || showToSelect) && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center"
          onClick={() => {
            setShowFromSelect(false);
            setShowToSelect(false);
            setSearchTerm('');
          }}
        >
          <div 
            className="bg-[#1A1B1F] w-full md:max-w-md md:rounded-2xl rounded-t-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-xl font-semibold mb-4">Select Asset</h3>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search stocks or crypto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#0D0E12] pl-10 pr-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'all' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActiveTab('stocks')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'stocks' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Stocks
                </button>
                <button
                  onClick={() => setActiveTab('crypto')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'crypto' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Crypto
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredAssets.map((asset) => (
                <button
                  key={asset.symbol}
                  onClick={() => {
                    if (showFromSelect) {
                      setFromAsset(asset);
                      setShowFromSelect(false);
                    } else {
                      setToAsset(asset);
                      setShowToSelect(false);
                    }
                    setSearchTerm('');
                    handleFromAmountChange(fromAmount);
                  }}
                  className="w-full p-4 hover:bg-gray-800/50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${
                      asset.type === 'stock' 
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-500' 
                        : 'bg-gradient-to-br from-purple-500 to-pink-500'
                    } rounded-full flex items-center justify-center font-bold`}>
                      {asset.symbol.slice(0, 1)}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{asset.symbol}</p>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          asset.type === 'stock' 
                            ? 'bg-blue-500/20 text-blue-400' 
                            : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {asset.type === 'stock' ? 'Stock' : 'Crypto'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">{asset.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${asset.price.toLocaleString()}</p>
                    <p className="text-sm text-gray-400">{asset.balance.toFixed(4)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
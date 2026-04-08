import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Portfolio } from "./components/Portfolio";
import { StockDetail } from "./components/StockDetail";
import { Balance } from "./components/Balance";
import { PortfolioHoldings } from "./components/PortfolioHoldings";
import { GetWallet } from "./components/GetWallet";
import { WeChatPay } from "./components/WeChatPay";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Portfolio },
      { path: "stock/:symbol", Component: StockDetail },
      { path: "portfolio", Component: PortfolioHoldings },
      { path: "balance",    Component: Balance    },
      { path: "wechat",     Component: WeChatPay  },
      { path: "get-wallet", Component: GetWallet  },
    ],
  },
]);

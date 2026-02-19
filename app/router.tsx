import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Portfolio } from "./components/Portfolio";
import { StockDetail } from "./components/StockDetail";
import { Swap } from "./components/Swap";
import { Pools } from "./components/Pools";
import { Activity } from "./components/Activity";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Portfolio },
      { path: "stock/:symbol", Component: StockDetail },
      { path: "swap", Component: Swap },
      { path: "pools", Component: Pools },
      { path: "activity", Component: Activity },
    ],
  },
]);

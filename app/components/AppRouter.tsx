"use client";

import { RouterProvider } from "react-router";
import { router } from "../router";
import { WalletProvider } from "../contexts/WalletContext";
import { Web3Provider } from "./Web3Provider";
import { CurrencyProvider } from "../contexts/CurrencyContext";

export function AppRouter() {
  return (
    <Web3Provider>
      <WalletProvider>
        <CurrencyProvider>
          <RouterProvider router={router} />
        </CurrencyProvider>
      </WalletProvider>
    </Web3Provider>
  );
}

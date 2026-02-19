"use client";

import { RouterProvider } from "react-router";
import { router } from "../router";
import { WalletProvider } from "../contexts/WalletContext";
import { Web3Provider } from "./Web3Provider";

export function AppRouter() {
  return (
    <Web3Provider>
      <WalletProvider>
        <RouterProvider router={router} />
      </WalletProvider>
    </Web3Provider>
  );
}

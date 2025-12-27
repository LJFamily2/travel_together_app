/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";
import { ApolloLink, HttpLink } from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { setContext } from "@apollo/client/link/context";
import {
  ApolloNextAppProvider,
  NextSSRApolloClient,
  NextSSRInMemoryCache,
  SSRMultipartLink,
} from "@apollo/experimental-nextjs-app-support/ssr";

import Cookies from "js-cookie";
import toast from "react-hot-toast";

function makeClient() {
const httpLink = new HttpLink({
  uri:
    typeof window === "undefined"
      ? `${process.env.NEXT_PUBLIC_CLIENT_URL}/api/graphql`
      : "/api/graphql",
});

  const errorLink = onError((error: any) => {
    const { graphQLErrors, networkError } = error || {};
    if (graphQLErrors && graphQLErrors.length > 0) {
      graphQLErrors.forEach((err: any) => {
        const code = err?.extensions?.code;
        if (
          code === "TOO_MANY_REQUESTS" ||
          /Too many requests/i.test(err.message)
        ) {
          toast.error(
            "Rate limit exceeded — please wait a moment and try again."
          );
        }
      });
    }

    if (networkError) {
      const ne: any = networkError as any;
      const status =
        ne.statusCode || ne.status || (ne.result && ne.result.status);
      if (status === 429 || /Too many requests/i.test(ne.message || "")) {
        toast.error(
          "Rate limit exceeded — please wait a moment and try again."
        );
      }
    }
  });

  const authLink = setContext((_, { headers }) => {
    const token =
      typeof window !== "undefined" ? Cookies.get("guestToken") : null;
    return {
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : "",
      },
    };
  });

  return new NextSSRApolloClient({
    cache: new NextSSRInMemoryCache(),
    link:
      typeof window === "undefined"
        ? ApolloLink.from([
            new SSRMultipartLink({
              stripDefer: true,
            }),
            httpLink,
          ])
        : ApolloLink.from([errorLink, authLink.concat(httpLink)]),
  });
}

export function ApolloWrapper({ children }: React.PropsWithChildren) {
  return (
    <ApolloNextAppProvider makeClient={makeClient}>
      {children}
    </ApolloNextAppProvider>
  );
}

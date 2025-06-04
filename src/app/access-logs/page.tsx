// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import type { AppRouter } from "@/server/api/root"; // Changed to AppRouter
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Assuming the API returns types that can be inferred for these
// For example, Prisma types or Zod inferred types from your router output

// Note: The following types assume `AppRouter` is correctly imported
// from your tRPC router definition (e.g., import type { AppRouter } from "@/server/api/root";).

// For an infinite query like accessLogs.list
type AccessLogItem = AppRouter["accessLogs"]["list"]["output"]["items"][number];

// For standard queries
type RoomData = AppRouter["rooms"]["getById"]["output"];
type KeyUsersListData = AppRouter["keyUsers"]["list"]["output"];
type KeyUserData = KeyUsersListData[number];

type NodesListData = AppRouter["nodes"]["getAll"]["output"];
type NodeData = NodesListData[number];

export default function AccessLogsPage() {
  const searchParams = useSearchParams();
  const roomIdFromQuery = searchParams.get("roomId");
  const keyUserIdFromQuery = searchParams.get("keyUserId");
  const nodeIdFromQuery = searchParams.get("nodeId");

  const [title, setTitle] = useState("Access Logs");

  const {
    data: roomData,
    isLoading: isLoadingRoom,
    error: errorRoom,
  } = api.rooms.getById.useQuery(
    { id: roomIdFromQuery || "" },
    { enabled: !!roomIdFromQuery },
  );
  const {
    data: keyUsersListData,
    isLoading: isLoadingKeyUser,
    error: errorKeyUser,
  } = api.keyUsers.list.useQuery(
    undefined, // list query usually doesn't take an ID
    { enabled: !!keyUserIdFromQuery }, // Still fetch if keyUserIdFromQuery is present to find the user
  );
  const {
    data: nodesListData,
    isLoading: isLoadingNode,
    error: errorNode,
  } = api.nodes.getAll.useQuery(
    undefined, // getAll query doesn't take an ID
    { enabled: !!nodeIdFromQuery }, // Still fetch if nodeIdFromQuery is present to find the node
  );

  const {
    data,
    isLoading: isLoadingLogs,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = api.accessLogs.list.useInfiniteQuery(
    {
      roomId: roomIdFromQuery ?? undefined,
      keyUserId: keyUserIdFromQuery ?? undefined,
      nodeId: nodeIdFromQuery ?? undefined,
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  useEffect(() => {
    let newTitle = "Access Logs";
    if (roomIdFromQuery) {
      newTitle = roomData
        ? `Access Logs for Room: ${roomData.name || roomIdFromQuery}`
        : `Access Logs for Room (ID: ${roomIdFromQuery})`;
    } else if (keyUserIdFromQuery) {
      const keyUser = keyUsersListData?.find(
        (user) => user.id === keyUserIdFromQuery,
      );
      newTitle = keyUser
        ? `Access Logs for User: ${keyUser.name || keyUser.email || keyUserIdFromQuery}`
        : `Access Logs for User (ID: ${keyUserIdFromQuery})`;
    } else if (nodeIdFromQuery) {
      const node = nodesListData?.find((n) => n.id === nodeIdFromQuery);
      newTitle = node
        ? `Access Logs for Node: ${node.name || nodeIdFromQuery}`
        : `Access Logs for Node (ID: ${nodeIdFromQuery})`;
    }
    setTitle(newTitle);
  }, [
    roomIdFromQuery,
    keyUserIdFromQuery,
    nodeIdFromQuery,
    roomData,
    keyUsersListData, // Changed from keyUserData
    nodesListData, // Changed from nodeData
  ]);

  useEffect(() => {
    if (error) {
      toast.error(`Error loading logs: ${error.message}`);
    }
  }, [error]);

  const logs: AccessLogItem[] = data?.pages.flatMap((page) => page.items) ?? [];

  if (isLoadingLogs && !logs.length)
    return <p className="container mx-auto p-4">Loading logs...</p>;

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>

      {/* Loading message for filter details */}
      {(roomIdFromQuery || keyUserIdFromQuery || nodeIdFromQuery) &&
        (isLoadingRoom || isLoadingKeyUser || isLoadingNode) &&
        !roomData &&
        (!keyUsersListData || keyUsersListData.length === 0) && // Check array
        (!nodesListData || nodesListData.length === 0) && ( // Check array
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-4">
            <p className="text-blue-600">Loading filter details...</p>
          </div>
        )}

      {/* Error messages for filter details */}
      {roomIdFromQuery && errorRoom && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-red-600">
            Error loading details for Room (ID: {roomIdFromQuery}):{" "}
            {errorRoom.message}
          </p>
        </div>
      )}
      {keyUserIdFromQuery && errorKeyUser && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-red-600">
            Error loading details for User (ID: {keyUserIdFromQuery}):{" "}
            {errorKeyUser.message}
          </p>
        </div>
      )}
      {nodeIdFromQuery && errorNode && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-red-600">
            Error loading details for Node (ID: {nodeIdFromQuery}):{" "}
            {errorNode.message}
          </p>
        </div>
      )}

      {/* Displaying logs count, adjust if needed based on filtering logic */}
      {logs.length === 0 && !isLoadingLogs && (
        <p>
          No access logs found for the current filter.
          {keyUserIdFromQuery &&
            Array.isArray(keyUsersListData) &&
            !keyUsersListData.find((user) => user.id === keyUserIdFromQuery) &&
            !isLoadingKeyUser && (
              <span className="ml-2 text-sm text-yellow-600">
                (User details for ID {keyUserIdFromQuery} might not be available
                or user does not exist)
              </span>
            )}
          {nodeIdFromQuery &&
            Array.isArray(nodesListData) &&
            !nodesListData.find((node) => node.id === nodeIdFromQuery) &&
            !isLoadingNode && (
              <span className="ml-2 text-sm text-yellow-600">
                (Node details for ID {nodeIdFromQuery} might not be available or
                node does not exist)
              </span>
            )}
        </p>
      )}

      {logs.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>User</TableHead>
              <TableHead>RFID Tag</TableHead>
              <TableHead>Node</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{format(new Date(log.timestamp), "PPpp")}</TableCell>
                <TableCell>
                  <Badge
                    variant={log.accessGranted ? "default" : "destructive"}
                  >
                    {log.accessGranted ? "Granted" : "Denied"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {log.keyUser ? (
                    <span>
                      {log.keyUser.name || log.keyUser.email || "N/A"}
                    </span>
                  ) : (
                    <span className="text-gray-500">N/A (Unknown Tag)</span>
                  )}
                </TableCell>
                <TableCell>{log.rfidTag}</TableCell>
                <TableCell>
                  <span>{log.node?.name || log.node?.id || "N/A"}</span>
                </TableCell>
                <TableCell>
                  {log.room ? (
                    <span>{log.room.name || log.room.id}</span>
                  ) : (
                    <span className="text-gray-500">N/A</span>
                  )}
                </TableCell>
                <TableCell>{log.reason || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage || isLoadingLogs}
          >
            {isFetchingNextPage ? "Loading more..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}

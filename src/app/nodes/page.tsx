"use client";

import { api } from "@/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

export default function NodesPage() {
  const { data: nodes, isLoading, error } = api.nodes.getAll.useQuery();

  if (isLoading) return <p>Loading nodes...</p>;
  if (error) return <p>Error loading nodes: {error.message}</p>;
  if (!nodes || nodes.length === 0) return <p>No nodes found.</p>;

  const isOnline = (lastSeen: Date) => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(lastSeen) > fiveMinutesAgo;
  };

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>Connected Nodes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((node) => (
                <TableRow key={node.id}>
                  <TableCell>{node.name || "N/A"}</TableCell>
                  <TableCell>{node.id}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        isOnline(node.lastSeen) ? "default" : "destructive"
                      }
                    >
                      {isOnline(node.lastSeen) ? "Online" : "Offline"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(node.lastSeen), {
                      addSuffix: true,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

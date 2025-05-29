"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { toast } from "sonner"; // Assuming you're using sonner for toasts

type Room = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  nodes: Node[];
};

type Node = {
  id: string;
  name: string | null;
  lastSeen: Date;
  roomId: string | null;
};

export default function RoomsPage() {
  const [roomName, setRoomName] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [nodeToAssign, setNodeToAssign] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);

  const listRoomsQuery = api.rooms.list.useQuery();
  const listNodesQuery = api.nodes.getAll.useQuery(); // Assuming you have a way to list all unassigned/assignable nodes

  const createRoomMutation = api.rooms.create.useMutation({
    onSuccess: () => {
      listRoomsQuery.refetch();
      setRoomName("");
      setIsCreateDialogOpen(false);
      toast.success("Room created successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to create room: ${error.message}`);
    },
  });

  const assignNodeMutation = api.rooms.assignNode.useMutation({
    onSuccess: () => {
      listRoomsQuery.refetch(); // Refetch rooms to update node list in room cards
      listNodesQuery.refetch(); // Refetch nodes to update assignable nodes list
      setIsAssignDialogOpen(false);
      setSelectedRoomId(null);
      setNodeToAssign(null);
      toast.success("Node assigned successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to assign node: ${error.message}`);
    },
  });

  const unassignNodeMutation = api.rooms.unassignNode.useMutation({
    onSuccess: () => {
      listRoomsQuery.refetch();
      listNodesQuery.refetch();
      toast.success("Node unassigned successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to unassign node: ${error.message}`);
    },
  });

  const deleteRoomMutation = api.rooms.delete.useMutation({
    onSuccess: () => {
      listRoomsQuery.refetch();
      listNodesQuery.refetch(); // Nodes might become unassigned
      toast.success("Room deleted successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to delete room: ${error.message}`);
    },
  });

  const handleCreateRoom = () => {
    if (roomName.trim()) {
      createRoomMutation.mutate({ name: roomName.trim() });
    }
  };

  const handleAssignNode = () => {
    if (selectedRoomId && nodeToAssign) {
      assignNodeMutation.mutate({
        roomId: selectedRoomId,
        nodeId: nodeToAssign,
      });
    }
  };

  const openAssignDialog = (roomId: string) => {
    setSelectedRoomId(roomId);
    setIsAssignDialogOpen(true);
  };

  const availableNodes =
    listNodesQuery.data?.filter((node) => !node.roomId) || [];

  if (listRoomsQuery.isLoading) return <p>Loading rooms...</p>;
  if (listRoomsQuery.error)
    return <p>Error loading rooms: {listRoomsQuery.error.message}</p>;

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Room Management</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>Create New Room</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Room</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="roomName" className="text-right">
                  Name
                </Label>
                <Input
                  id="roomName"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="col-span-3"
                  placeholder="Enter room name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                onClick={handleCreateRoom}
                disabled={createRoomMutation.isPending || !roomName.trim()}
              >
                {createRoomMutation.isPending ? "Creating..." : "Create Room"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {listRoomsQuery.data && listRoomsQuery.data.length === 0 && (
        <p>No rooms created yet. Click "Create New Room" to get started.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {listRoomsQuery.data?.map((room: Room) => (
          <Card key={room.id}>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                {room.name}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteRoomMutation.mutate({ id: room.id })}
                  disabled={deleteRoomMutation.isPending}
                >
                  Delete Room
                </Button>
              </CardTitle>
              <CardDescription>
                Created: {new Date(room.createdAt).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <h3 className="font-semibold mb-2">Nodes in this room:</h3>
              {room.nodes && room.nodes.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Node ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {room.nodes.map((node) => (
                      <TableRow key={node.id}>
                        <TableCell className="font-mono text-xs">
                          {node.id}
                        </TableCell>
                        <TableCell>{node.name || "N/A"}</TableCell>
                        <TableCell>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() =>
                              unassignNodeMutation.mutate({ nodeId: node.id })
                            }
                            disabled={unassignNodeMutation.isPending}
                          >
                            Unassign
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No nodes assigned to this room.
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                onClick={() => openAssignDialog(room.id)}
                className="w-full"
              >
                Assign Node to Room
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Node to Room</DialogTitle>
            <DialogDescription>
              Select a node to assign to room:{" "}
              {listRoomsQuery.data?.find((r) => r.id === selectedRoomId)?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Select
              onValueChange={setNodeToAssign}
              value={nodeToAssign || undefined}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a node" />
              </SelectTrigger>
              <SelectContent>
                {availableNodes.length > 0 ? (
                  availableNodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name || node.id} (ID: {node.id.substring(0, 8)}...)
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-nodes" disabled>
                    No available nodes to assign.
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleAssignNode}
              disabled={
                assignNodeMutation.isPending || !nodeToAssign || !selectedRoomId
              }
            >
              {assignNodeMutation.isPending ? "Assigning..." : "Assign Node"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

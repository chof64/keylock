"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import Link from "next/link"; // Import Link
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

// Define Key and KeyUser types based on backend
type KeyFromAPI = {
  id: string;
  keyId: string; // This is the actual card ID (e.g., RFID tag)
};

type KeyUserFromAPI = {
  id: string;
  name: string | null;
  email: string | null;
  key?: KeyFromAPI | null; // Associated Key object - made optional
};

type KeyUserRoomPermissionFromAPI = {
  keyUserId: string;
  roomId: string;
  keyUser: KeyUserFromAPI;
  assignedAt: Date;
};

// Node type (assuming it's simple and used as is)
type Node = {
  id: string;
  name: string | null;
  lastSeen: Date;
  roomId: string | null;
};

// Update Room type
type RoomWithKeyUserPermissions = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  nodes: Node[];
  keyUserPermissions: KeyUserRoomPermissionFromAPI[];
};

// Helper function to get Card ID
const getCardId = (keyUser: KeyUserFromAPI): string => {
  return keyUser.key?.keyId ?? "N/A";
};

export default function RoomsPage() {
  const [roomName, setRoomName] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [nodeToAssign, setNodeToAssign] = useState<string | null>(null);
  const [keyUserToAssign, setKeyUserToAssign] = useState<string | null>(null); // Changed from userToAssign
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAssignNodeDialogOpen, setIsAssignNodeDialogOpen] = useState(false);
  const [isAssignUserDialogOpen, setIsAssignUserDialogOpen] = useState(false);

  const listRoomsQuery = api.rooms.list.useQuery();
  const listNodesQuery = api.nodes.getAll.useQuery();
  const listKeyUsersQuery = api.keyUsers.list.useQuery(); // Query to get all key users

  const utils = api.useUtils();

  const createRoomMutation = api.rooms.create.useMutation({
    onSuccess: () => {
      utils.rooms.list.invalidate();
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
      utils.rooms.list.invalidate();
      utils.nodes.getAll.invalidate();
      setIsAssignNodeDialogOpen(false);
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
      utils.rooms.list.invalidate();
      utils.nodes.getAll.invalidate();
      toast.success("Node unassigned successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to unassign node: ${error.message}`);
    },
  });

  const deleteRoomMutation = api.rooms.delete.useMutation({
    onSuccess: () => {
      utils.rooms.list.invalidate();
      utils.nodes.getAll.invalidate();
      toast.success("Room deleted successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to delete room: ${error.message}`);
    },
  });

  const assignUserMutation = api.rooms.assignUser.useMutation({
    onSuccess: () => {
      utils.rooms.list.invalidate();
      // utils.keyUsers.list.invalidate(); // Optionally invalidate if available key users list needs update
      setIsAssignUserDialogOpen(false);
      setSelectedRoomId(null);
      setKeyUserToAssign(null); // Changed
      toast.success("KeyUser assigned to room successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to assign KeyUser: ${error.message}`);
    },
  });

  const unassignUserMutation = api.rooms.unassignUser.useMutation({
    onSuccess: () => {
      utils.rooms.list.invalidate();
      toast.success("KeyUser unassigned from room successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to unassign KeyUser: ${error.message}`);
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

  const handleAssignUser = () => {
    if (selectedRoomId && keyUserToAssign) {
      // Changed
      assignUserMutation.mutate({
        roomId: selectedRoomId,
        keyUserId: keyUserToAssign, // Changed from userId
      });
    }
  };

  const openAssignNodeDialog = (roomId: string) => {
    setSelectedRoomId(roomId);
    setNodeToAssign(null);
    setIsAssignNodeDialogOpen(true);
  };

  const openAssignUserDialog = (roomId: string) => {
    setSelectedRoomId(roomId);
    setKeyUserToAssign(null); // Changed
    setIsAssignUserDialogOpen(true);
  };

  const availableNodes =
    listNodesQuery.data?.filter((node) => !node.roomId) || [];

  const availableKeyUsersForAssignment =
    listKeyUsersQuery.data?.filter((keyUser) => {
      // Changed
      if (!selectedRoomId) return true;
      const room = listRoomsQuery.data?.find((r) => r.id === selectedRoomId) as
        | RoomWithKeyUserPermissions
        | undefined;
      if (!room) return true;
      return !room.keyUserPermissions.some((p) => p.keyUserId === keyUser.id);
    }) || [];

  if (
    listRoomsQuery.isLoading ||
    listNodesQuery.isLoading ||
    listKeyUsersQuery.isLoading
  )
    return <p>Loading data...</p>; // Changed
  if (listRoomsQuery.error)
    return <p>Error loading rooms: {listRoomsQuery.error.message}</p>;
  if (listNodesQuery.error)
    return <p>Error loading nodes: {listNodesQuery.error.message}</p>;
  if (listKeyUsersQuery.error)
    // Changed
    return <p>Error loading key users: {listKeyUsersQuery.error.message}</p>; // Changed

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-bold text-2xl">Room Management</h1>
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {listRoomsQuery.data?.map(
          (
            room: RoomWithKeyUserPermissions, // Type cast remains, now compatible
          ) => (
            <Card key={room.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {room.name}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteRoomMutation.mutate({ id: room.id })}
                    disabled={deleteRoomMutation.isPending}
                  >
                    Delete Room
                  </Button>
                </CardTitle>
                <CardDescription>
                  Created: {new Date(room.createdAt).toLocaleDateString()}
                  <br />
                  <Link href={`/access-logs?roomId=${room.id}`} passHref>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto text-blue-500 hover:text-blue-700"
                    >
                      View Access Logs
                    </Button>
                  </Link>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Assigned Nodes Section */}
                <h4 className="mb-2 font-semibold text-md">Assigned Nodes:</h4>
                {room.nodes.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Node Name</TableHead>
                        <TableHead>Last Seen</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {room.nodes.map((node) => (
                        <TableRow key={node.id}>
                          <TableCell>{node.name || "N/A"}</TableCell>
                          <TableCell>
                            {new Date(node.lastSeen).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
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
                  <p className="text-gray-500 text-sm">
                    No nodes assigned to this room.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => openAssignNodeDialog(room.id)}
                >
                  Assign Node
                </Button>

                {/* Users with Access Section */}
                <h4 className="mt-4 mb-2 font-semibold text-md">
                  KeyUsers with Access:
                </h4>
                {room.keyUserPermissions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Card ID</TableHead>
                        <TableHead>Assigned At</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {room.keyUserPermissions.map((permission) => (
                        <TableRow key={permission.keyUserId}>
                          <TableCell>
                            {permission.keyUser.name || "N/A"}
                          </TableCell>
                          <TableCell>
                            {permission.keyUser.email || "N/A"}
                          </TableCell>
                          <TableCell>{getCardId(permission.keyUser)}</TableCell>
                          <TableCell>
                            {new Date(
                              permission.assignedAt,
                            ).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                unassignUserMutation.mutate({
                                  roomId: room.id,
                                  keyUserId: permission.keyUserId,
                                })
                              }
                              disabled={unassignUserMutation.isPending}
                            >
                              Unassign
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 text-sm">
                    No KeyUsers have access to this room.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => openAssignUserDialog(room.id)}
                >
                  Grant KeyUser Access
                </Button>
              </CardContent>
            </Card>
          ),
        )}
      </div>

      {/* Assign Node Dialog */}
      <Dialog
        open={isAssignNodeDialogOpen}
        onOpenChange={setIsAssignNodeDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Assign Node to Room:{" "}
              {listRoomsQuery.data?.find((r) => r.id === selectedRoomId)?.name}
            </DialogTitle>
            <DialogDescription>
              Select an available node to assign to this room.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nodeToAssign" className="text-right">
                Node
              </Label>
              <Select
                onValueChange={setNodeToAssign}
                value={nodeToAssign || undefined}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a node" />
                </SelectTrigger>
                <SelectContent>
                  {availableNodes.length > 0 ? (
                    availableNodes.map((node) => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.name || node.id} (Last seen:{" "}
                        {new Date(node.lastSeen).toLocaleDateString()})
                      </SelectItem>
                    ))
                  ) : (
                    <p className="p-2 text-gray-500 text-sm">
                      No available nodes to assign.
                    </p>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="submit"
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

      {/* Assign User Dialog */}
      <Dialog
        open={isAssignUserDialogOpen}
        onOpenChange={setIsAssignUserDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Grant KeyUser Access to Room:{" "}
              {listRoomsQuery.data?.find((r) => r.id === selectedRoomId)?.name}
            </DialogTitle>
            <DialogDescription>
              Select a KeyUser to grant them access to this room.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="keyUserToAssign" className="text-right">
                KeyUser
              </Label>
              <Select
                onValueChange={setKeyUserToAssign}
                value={keyUserToAssign || undefined}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a KeyUser" />
                </SelectTrigger>
                <SelectContent>
                  {availableKeyUsersForAssignment.length > 0 ? (
                    availableKeyUsersForAssignment.map((keyUser) => (
                      <SelectItem key={keyUser.id} value={keyUser.id}>
                        {keyUser.name || "Unnamed KeyUser"} (
                        {keyUser.email || "No email"}) - Card:{" "}
                        {getCardId(keyUser)}
                      </SelectItem>
                    ))
                  ) : (
                    <p className="p-2 text-gray-500 text-sm">
                      No more KeyUsers to assign to this room.
                    </p>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="submit"
              onClick={handleAssignUser}
              disabled={
                assignUserMutation.isPending ||
                !keyUserToAssign ||
                !selectedRoomId
              }
            >
              {assignUserMutation.isPending
                ? "Granting Access..."
                : "Grant Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

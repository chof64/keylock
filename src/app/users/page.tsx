"use client";

import { useEffect, useState } from "react"; // Added useEffect
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"; // Added Select components

// Type for the Key model
type Key = {
  id: string;
  keyId: string; // RFID Tag ID
  name: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  keyUserId: string | null; // Foreign key to KeyUser
};

// Updated KeyUser type to include the Key
type KeyUser = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  platformUserId: string | null;
  key: Key | null; // Can be null if no key is assigned
};

// Type for Node (adjust based on your actual Node model structure if different)
type Node = {
  id: string;
  name: string | null;
  lastSeen: Date;
  // Add other fields if necessary, e.g., roomId
};

export default function KeyUsersPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // State for the "Create Key" dialog
  const [isCreateKeyDialogOpen, setIsCreateKeyDialogOpen] = useState(false);
  const [selectedKeyUserId, setSelectedKeyUserId] = useState<string | null>(
    null,
  );
  const [rfidTagIdFromScan, setRfidTagIdFromScan] = useState<string | null>(
    null,
  ); // State to hold the scanned RFID Tag ID
  const [selectedNodeIdForScan, setSelectedNodeIdForScan] = useState<
    string | undefined
  >(undefined);
  const [isListeningForScan, setIsListeningForScan] = useState(false); // To show loading/listening state

  const listKeyUsersQuery = api.keyUsers.list.useQuery();
  const listNodesQuery = api.nodes.getAll.useQuery(); // Fetch nodes

  // tRPC query to get the scanned RFID tag
  const { data: scannedTagData, error: scannedTagError } =
    api.keyUsers.getScannedRfidTag.useQuery(
      { nodeId: selectedNodeIdForScan || "" }, // Provide a default empty string if undefined
      {
        enabled: !!selectedNodeIdForScan && isListeningForScan, // Only run when a node is selected and we are actively listening
        refetchInterval: 1000, // Poll every 1 second
        // onSuccess and onError removed from here
      },
    );

  // useEffect to handle successful data fetching for getScannedTagQuery
  useEffect(() => {
    if (scannedTagData?.rfidTagId) {
      setRfidTagIdFromScan(scannedTagData.rfidTagId);
      setIsListeningForScan(false); // Stop polling once tag is received
      toast.success(`RFID Tag Scanned: ${scannedTagData.rfidTagId}`);
    }
  }, [scannedTagData]); // Dependency: run when scannedTagData changes

  // useEffect to handle errors from getScannedTagQuery
  useEffect(() => {
    if (scannedTagError) {
      if (isListeningForScan) {
        // console.warn(`Polling for RFID tag: ${scannedTagError.message}`);
      } else {
        toast.error(`Error fetching RFID tag: ${scannedTagError.message}`);
      }
    }
  }, [scannedTagError, isListeningForScan]); // Dependencies: run when scannedTagError or isListeningForScan changes

  const createKeyUserMutation = api.keyUsers.create.useMutation({
    onSuccess: () => {
      listKeyUsersQuery.refetch();
      setName("");
      setEmail("");
      setIsCreateDialogOpen(false);
      toast.success("User created successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to create user: ${error.message}`);
    },
  });

  const createKeyMutation = api.keyUsers.createKey.useMutation({
    onSuccess: () => {
      listKeyUsersQuery.refetch(); // Refetch users to show the new key
      setRfidTagIdFromScan(null); // Reset scanned tag
      setSelectedKeyUserId(null);
      setIsCreateKeyDialogOpen(false);
      setSelectedNodeIdForScan(undefined); // Reset selected node
      setIsListeningForScan(false); // Reset listening state
      toast.success("RFID Key created and assigned successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to create RFID Key: ${error.message}`);
      setIsListeningForScan(false); // Stop listening on error
    },
  });

  const handleCreateKeyUser = () => {
    if (name.trim()) {
      createKeyUserMutation.mutate({
        name: name.trim(),
        email: email.trim() || undefined,
      });
    }
  };

  const utils = api.useUtils();
  const clearCacheMutation = api.keyUsers.clearRfidCacheForNode.useMutation();

  const openCreateKeyDialog = (user: KeyUser) => {
    setSelectedKeyUserId(user.id);
    setRfidTagIdFromScan(null);
    setIsListeningForScan(false);

    if (selectedNodeIdForScan) {
      clearCacheMutation.mutate(
        { nodeId: selectedNodeIdForScan },
        {
          onSuccess: () => {
            console.log(
              `MQTT Cache: Cleared for node ${selectedNodeIdForScan} on dialog open.`,
            );
            setIsCreateKeyDialogOpen(true);
          },
          onError: (error) => {
            console.error(
              `MQTT Cache: Failed to clear for node ${selectedNodeIdForScan} on dialog open:`,
              error,
            );
            setIsCreateKeyDialogOpen(true);
          },
        },
      );
    } else {
      setIsCreateKeyDialogOpen(true);
    }
  };

  const handleStartScan = () => {
    if (!selectedNodeIdForScan) {
      toast.error("Please select a KeyLock device first.");
      return;
    }
    setRfidTagIdFromScan(null);
    clearCacheMutation.mutate(
      { nodeId: selectedNodeIdForScan },
      {
        onSuccess: () => {
          console.log(
            `MQTT Cache: Cleared for node ${selectedNodeIdForScan}. Starting scan...`,
          );
          setIsListeningForScan(true);
        },
        onError: (error) => {
          console.error(
            `MQTT Cache: Failed to clear for node ${selectedNodeIdForScan} before scan:`,
            error,
          );
          toast.error(
            "Could not clear previous scan session. Proceeding with scan, but old data might appear briefly.",
          );
          setIsListeningForScan(true);
        },
      },
    );
  };

  const handleCreateKey = () => {
    if (!selectedKeyUserId || !rfidTagIdFromScan /* || !selectedNodeIdForScan */) { // selectedNodeIdForScan might not be strictly needed for key creation itself if not used by backend
      toast.error(
        "Missing user or RFID tag. Please ensure all are selected/scanned.",
      );
      return;
    }
    createKeyMutation.mutate({
      keyUserId: selectedKeyUserId,
      keyId: rfidTagIdFromScan,
      // name: "Default Key Name", // Optional: Or derive from user/node
      // nodeId: selectedNodeIdForScan, // Removed as it's not in the mutation's input type
    });
  };

  // Effect to stop polling if dialog is closed or node selection changes
  useEffect(() => {
    if (!isCreateKeyDialogOpen || !selectedNodeIdForScan) {
      setIsListeningForScan(false);
    }
  }, [isCreateKeyDialogOpen, selectedNodeIdForScan]);

  if (listKeyUsersQuery.isLoading) return <p>Loading users...</p>;
  if (listKeyUsersQuery.error)
    return <p>Error loading users: {listKeyUsersQuery.error.message}</p>;

  // Potentially handle node loading/error states as well
  // if (listNodesQuery.isLoading) return <p>Loading nodes...</p>;
  // if (listNodesQuery.error) return <p>Error loading nodes: {listNodesQuery.error.message}</p>;

  const selectedUserForDialog = listKeyUsersQuery.data?.find(
    (u) => u.id === selectedKeyUserId,
  );
  const selectedNodeForDialog = listNodesQuery.data?.find(
    (n) => n.id === selectedNodeIdForScan,
  );

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">User Management (KeyLock Users)</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>Register New User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New KeyLock User</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="userName" className="text-right">
                  Name
                </Label>
                <Input
                  id="userName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="col-span-3"
                  placeholder="Enter user's full name"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="userEmail" className="text-right">
                  Email (Optional)
                </Label>
                <Input
                  id="userEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="col-span-3"
                  placeholder="Enter user's email address"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                type="submit"
                onClick={handleCreateKeyUser}
                disabled={createKeyUserMutation.isPending || !name.trim()}
              >
                {createKeyUserMutation.isPending
                  ? "Registering..."
                  : "Register User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {listKeyUsersQuery.data && listKeyUsersQuery.data.length === 0 && (
        <p>
          No users registered yet. Click "Register New User" to get started.
        </p>
      )}

      {listKeyUsersQuery.data && listKeyUsersQuery.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Registered Users</CardTitle>
            <CardDescription>
              List of all users registered in the KeyLock system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>RFID Key ID</TableHead>
                  <TableHead>Registered On</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listKeyUsersQuery.data?.map((user: KeyUser) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email || "N/A"}</TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <span className="text-green-600">Active</span>
                      ) : (
                        <span className="text-red-600">Inactive</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {user.key ? user.key.keyId : "No Key"}
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        {!user.key && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openCreateKeyDialog(user)} // Pass the whole user object
                          >
                            Create RFID Key
                          </Button>
                        )}
                        {user.key && (
                          <Button variant="outline" size="sm" disabled>
                            Manage Key
                          </Button>
                        )}
                        {/* Placeholder for future actions like Edit, Deactivate, Link to Platform User etc. */}
                        {/* <Button variant="outline" size="sm" disabled className="ml-2"> Manage User </Button> */}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialog for Creating a new RFID Key */}
      <Dialog
        open={isCreateKeyDialogOpen}
        onOpenChange={setIsCreateKeyDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New RFID Key</DialogTitle>
            <DialogDescription>
              Assign a new RFID Key to user:{" "}
              <strong>{selectedUserForDialog?.name || "Unknown User"}</strong>.
              <br />
              1. Select the KeyLock device below.
              <br />
              2. Click "Start Scan" and then scan the new RFID card on the
              selected device.
              <br />
              The RFID Tag ID will be captured and displayed. Click "Create Key"
              once the scan is confirmed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="keylockNode" className="text-right">
                KeyLock Device
              </Label>
              <Select
                value={selectedNodeIdForScan}
                onValueChange={setSelectedNodeIdForScan}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a KeyLock device" />
                </SelectTrigger>
                <SelectContent>
                  {listNodesQuery.data?.map((node: Node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name || node.id} (Last seen:{" "}
                      {new Date(node.lastSeen).toLocaleTimeString()})
                    </SelectItem>
                  ))}
                  {(!listNodesQuery.data ||
                    listNodesQuery.data.length === 0) && (
                    <SelectItem value="no-nodes" disabled>
                      No KeyLock devices found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Display area for scanned RFID tag */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="scannedRfidTag" className="text-right">
                Scanned Tag ID
              </Label>
              <Input
                id="scannedRfidTag"
                value={
                  rfidTagIdFromScan ||
                  (isListeningForScan ? "Scanning..." : "N/A")
                }
                className="col-span-3 font-mono text-sm"
                readOnly
                disabled
              />
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              onClick={handleStartScan}
              disabled={
                !selectedNodeIdForScan ||
                isListeningForScan ||
                !!rfidTagIdFromScan // Disable if already scanned
              }
              variant="secondary"
            >
              {isListeningForScan
                ? "Listening..."
                : rfidTagIdFromScan
                  ? "Scan Complete"
                  : "Start Scan"}
            </Button>
            <div className="flex space-x-2">
              <DialogClose asChild>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Reset states when cancelling/closing the dialog
                    setSelectedKeyUserId(null);
                    setRfidTagIdFromScan(null);
                    setSelectedNodeIdForScan(undefined);
                    setIsListeningForScan(false);
                    // setIsCreateKeyDialogOpen(false); // Dialog closes automatically by DialogClose
                  }}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                onClick={handleCreateKey} // Corrected: Call handleCreateKey
                disabled={
                  createKeyMutation.isPending ||
                  !selectedKeyUserId ||
                  !selectedNodeIdForScan ||
                  !rfidTagIdFromScan ||
                  isListeningForScan
                }
              >
                {createKeyMutation.isPending ? "Creating..." : "Create Key"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

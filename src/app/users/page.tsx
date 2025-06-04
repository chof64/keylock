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
  const {
    data: scannedTagData,
    error: scannedTagError,
    isFetching,
  } = api.keyUsers.getScannedRfidTag.useQuery(
    { nodeId: selectedNodeIdForScan || "" }, // Provide a default empty string if undefined
    {
      enabled: !!selectedNodeIdForScan && isListeningForScan, // Only run when a node is selected and we are actively listening
      refetchInterval: 1000, // Poll every 1 second
      // onSuccess and onError removed from here
    },
  );

  // useEffect to handle successful data fetching for getScannedTagQuery
  useEffect(() => {
    // Only update if we are actively listening, not currently fetching, AND a new tag ID is present.
    if (isListeningForScan && !isFetching && scannedTagData?.rfidTagId) {
      setRfidTagIdFromScan(scannedTagData.rfidTagId);
      setIsListeningForScan(false); // Stop polling once a new tag is received
      toast.success(`RFID Tag Scanned: ${scannedTagData.rfidTagId}`);
    }
    // If listening, not fetching, and server returns null (no tag), continue polling.
  }, [scannedTagData, isListeningForScan, isFetching]); // Add isFetching to dependencies

  // useEffect to handle errors from getScannedTagQuery
  useEffect(() => {
    // Only process errors if we were actively listening and the fetch attempt has completed.
    if (scannedTagError && isListeningForScan && !isFetching) {
      toast.error(`Error during RFID scan: ${scannedTagError.message}`);
      setIsListeningForScan(false); // Stop listening on error
    }
  }, [scannedTagError, isListeningForScan, isFetching]); // Add isFetching to dependencies

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

  const deleteKeyMutation = api.keyUsers.deleteKey.useMutation({
    onSuccess: () => {
      listKeyUsersQuery.refetch(); // Refetch users to reflect the key removal
      toast.success("Key removed successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to remove key: ${error.message}`);
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

  const handleRemoveKey = (keyId: string) => {
    if (!keyId) {
      toast.error("Invalid Key ID provided for removal.");
      return;
    }
    // Optional: Add a confirmation dialog here before deleting
    // For example: if (confirm("Are you sure you want to remove this key?")) { ... }
    deleteKeyMutation.mutate({ keyId });
  };

  const utils = api.useUtils();
  const clearCacheMutation = api.keyUsers.clearRfidCacheForNode.useMutation();

  const openCreateKeyDialog = (user: KeyUser) => {
    setSelectedKeyUserId(user.id);
    setRfidTagIdFromScan(null); // Reset local display of any previous scan
    setIsListeningForScan(false); // Ensure polling is off
    setSelectedNodeIdForScan(undefined); // Reset selected node to force re-selection
    setIsCreateKeyDialogOpen(true);
  };

  const handleNodeSelectionChange = (nodeId: string | undefined) => {
    setSelectedNodeIdForScan(nodeId);
    setRfidTagIdFromScan(null); // Reset any previous scan result for the new node
    setIsListeningForScan(false); // Stop listening, user needs to press "Start Scan" again

    if (nodeId) {
      clearCacheMutation.mutate(
        { nodeId },
        {
          onSuccess: () => {
            const nodeName =
              listNodesQuery.data?.find((n) => n.id === nodeId)?.name || nodeId;
            console.log(
              `MQTT Cache: Cleared for selected node ${nodeName} (${nodeId}).`,
            );
            toast.info(
              `KeyLock device "${nodeName}" selected. Ready for scan.`,
            );
          },
          onError: (error) => {
            const nodeName =
              listNodesQuery.data?.find((n) => n.id === nodeId)?.name || nodeId;
            console.error(
              `MQTT Cache: Failed to clear for node ${nodeName} (${nodeId}) on selection:`,
              error,
            );
            toast.error(
              `Could not fully prepare node "${nodeName}". Previous scan data might persist.`,
            );
          },
        },
      );
    }
  };

  const handleStartScan = () => {
    if (!selectedNodeIdForScan) {
      toast.error("Please select a KeyLock device first.");
      return;
    }

    // Invalidate the query to ensure fresh data is fetched from the server
    utils.keyUsers.getScannedRfidTag.invalidate({
      nodeId: selectedNodeIdForScan,
    });

    // Explicitly set to null here to ensure UI updates immediately to "Scanning..."
    setRfidTagIdFromScan(null);

    // Cache is cleared by handleNodeSelectionChange when a node is selected.
    // RFID tag display is reset by handleNodeSelectionChange or when dialog opens, and now above.
    setIsListeningForScan(true);
    toast.info("Listening for RFID card scan...");
  };

  const handleCreateKey = () => {
    if (
      !selectedKeyUserId ||
      !rfidTagIdFromScan /* || !selectedNodeIdForScan */
    ) {
      // selectedNodeIdForScan might not be strictly needed for key creation itself if not used by backend
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
                          <Button
                            variant="destructive" // Changed variant to destructive for removal
                            size="sm"
                            // biome-ignore lint/style/noNonNullAssertion: <explanation>
                            onClick={() => handleRemoveKey(user.key!.id)} // Call handleRemoveKey with the Key ID
                            disabled={deleteKeyMutation.isPending} // Disable while deleting
                          >
                            {deleteKeyMutation.isPending &&
                            deleteKeyMutation.variables?.keyId === user.key.id
                              ? "Removing..."
                              : "Remove Key"}
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
                onValueChange={handleNodeSelectionChange} // Changed to use the new handler
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

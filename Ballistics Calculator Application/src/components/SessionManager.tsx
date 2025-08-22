import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { updateSession, newSession } from "../pages/dope.handlers";
import { toast } from "sonner@2.0.3";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

export function SessionManager({ 
  compact = false,
  showNewSession = true 
}: { 
  compact?: boolean;
  showNewSession?: boolean;
}) {
  const { state, setState } = useApp();
  const { session } = state;

  const [isEditing, setIsEditing] = useState(false);
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(session?.title || "");
  const [editPlace, setEditPlace] = useState(session?.place || "");
  const [newTitle, setNewTitle] = useState("");
  const [newPlace, setNewPlace] = useState("");

  const handleSaveEdit = () => {
    if (!session) return;
    
    updateSession(state, setState, { 
      title: editTitle.trim() || "Untitled Session",
      place: editPlace.trim()
    });
    setIsEditing(false);
    toast.success("Session updated");
  };

  const handleCancelEdit = () => {
    setEditTitle(session?.title || "");
    setEditPlace(session?.place || "");
    setIsEditing(false);
  };

  const handleNewSession = () => {
    newSession(state, setState, newTitle.trim() || undefined, newPlace.trim() || undefined);
    setNewTitle("");
    setNewPlace("");
    setIsNewSessionOpen(false);
    toast.success("New session created");
  };

  if (!session) {
    return (
      <div className="text-muted-foreground text-sm">
        No active session
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{session.title}</div>
          {session.place && (
            <div className="text-sm text-muted-foreground truncate">{session.place}</div>
          )}
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Session</DialogTitle>
              <DialogDescription>
                Update the session name and location information.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-title">Session Name</Label>
                <Input
                  id="edit-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Enter session name"
                />
              </div>
              <div>
                <Label htmlFor="edit-place">Location/Place</Label>
                <Input
                  id="edit-place"
                  value={editPlace}
                  onChange={(e) => setEditPlace(e.target.value)}
                  placeholder="e.g., Local Range, Camp Perry, etc."
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveEdit}>Save</Button>
                <Button variant="outline" onClick={handleCancelEdit}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Current Session</CardTitle>
          {showNewSession && (
            <Dialog open={isNewSessionOpen} onOpenChange={setIsNewSessionOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  New Session
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Session</DialogTitle>
                  <DialogDescription>
                    Create a new shooting session with a name and location.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="new-title">Session Name</Label>
                    <Input
                      id="new-title"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Enter session name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-place">Location/Place</Label>
                    <Input
                      id="new-place"
                      value={newPlace}
                      onChange={(e) => setNewPlace(e.target.value)}
                      placeholder="e.g., Local Range, Camp Perry, etc."
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleNewSession}>Create Session</Button>
                    <Button variant="outline" onClick={() => setIsNewSessionOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-title">Session Name</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter session name"
              />
            </div>
            <div>
              <Label htmlFor="edit-place">Location/Place</Label>
              <Input
                id="edit-place"
                value={editPlace}
                onChange={(e) => setEditPlace(e.target.value)}
                placeholder="e.g., Local Range, Camp Perry, etc."
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit}>
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium mb-1">{session.title}</h3>
                {session.place && (
                  <p className="text-sm text-muted-foreground mb-2">{session.place}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Started: {new Date(session.startedAt).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  ID: {session.id.split('-')[0]}
                </p>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => {
                  setEditTitle(session.title);
                  setEditPlace(session.place);
                  setIsEditing(true);
                }}
              >
                Edit
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
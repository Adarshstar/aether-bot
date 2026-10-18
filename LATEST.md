# Aether v1.12.0-alpha

## This release
- Stop the void fall. Unknown chunks are not air, so gravity cannot run the player to Y=-millions.
- Ignore server positions outside Y -60..360 and send a respawn instead of confirming them.
- VerticalCollision is only sent while actually on ground.
- Look yaw is degrees, matching Bedrock, so walk direction matches the look packet.
- Play loop stands still after join, then walks, digs real blocks, places only with an item in hand, and turns away from nearby entities.

## Target (read-only server)
Elastic IP 13.126.209.44 port 19132 — Lotus SMP, BDS 1.26.52, protocol 2193.
The bot host is Aether-Bot-Cheap. The Lotus instance is not changed.

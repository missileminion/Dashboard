package io.github.missileminion.dashboard

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONArray
import org.json.JSONObject

// The phone end of the Galaxy Watch link (Wear OS Data Layer, over Bluetooth, or Wi-Fi when Bluetooth is out of range).
// Watch → phone: every set logged on the watch is a data item at /gym/add/<id> (an undo is /gym/del/<id>). Data items are
// queued by Google Play services and delivered whenever the two are connected, so nothing is lost if the phone is away.
// This service is started by the system even when the app is closed: it moves each item into a small inbox here and deletes
// the item; the page drains the inbox (HealthConnect.wearDrain) the next time it runs and syncs the sets to GitHub as usual.
// Phone → watch: the page publishes /gym/state (program, unit, step, last weights, today's sets) after every change.
object WearSync {
    private const val PREFS = "wear"
    private const val INBOX = "inbox"

    fun push(ctx: Context, op: JSONObject) = synchronized(this) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val a = JSONArray(p.getString(INBOX, "[]")); a.put(op)
        p.edit().putString(INBOX, a.toString()).apply()
    }

    fun drain(ctx: Context): JSONArray = synchronized(this) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val a = JSONArray(p.getString(INBOX, "[]")); p.edit().putString(INBOX, "[]").apply(); a
    }

    // For the Connections sheet: the paired watch, whether our watch app is on it, and when each side last heard from the other.
    // Blocking calls: run off the main thread. The watch app advertises the "dashboard_gym" capability (wear/…/values/wear.xml).
    fun status(ctx: Context): JSONObject {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val out = JSONObject().put("lastIn", p.getLong("lastIn", 0)).put("lastOut", p.getLong("lastOut", 0))
        val nodes = Tasks.await(Wearable.getNodeClient(ctx).connectedNodes)
        val app = Tasks.await(Wearable.getCapabilityClient(ctx).getCapability("dashboard_gym", CapabilityClient.FILTER_REACHABLE)).nodes.map { it.id }.toSet()
        out.put("watches", JSONArray(nodes.map { JSONObject().put("name", it.displayName).put("nearby", it.isNearby).put("app", it.id in app) }))
        return out
    }

    // any other phone → watch message (the watch face's data: /face/state)
    fun put(ctx: Context, path: String, json: String) {
        val req = PutDataMapRequest.create(path).apply { dataMap.putString("json", json); dataMap.putLong("at", System.currentTimeMillis()) }
        Wearable.getDataClient(ctx).putDataItem(req.asPutDataRequest().setUrgent())
    }

    fun publishState(ctx: Context, json: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("lastOut", System.currentTimeMillis()).apply()
        val req = PutDataMapRequest.create("/gym/state").apply { dataMap.putString("json", json); dataMap.putLong("at", System.currentTimeMillis()) }
        Wearable.getDataClient(ctx).putDataItem(req.asPutDataRequest().setUrgent())
    }

    fun handle(ctx: Context, events: DataEventBuffer) {
        var got = false
        for (ev in events) {
            if (ev.type != DataEvent.TYPE_CHANGED) continue
            val item = ev.dataItem; val path = item.uri.path ?: continue
            val json = try { DataMapItem.fromDataItem(item).dataMap.getString("json") } catch (e: Exception) { null }
            when {
                path.startsWith("/gym/add/") && json != null -> { push(ctx, JSONObject().put("op", "add").put("entry", JSONObject(json))); got = true }
                path.startsWith("/run/add/") && json != null -> { push(ctx, JSONObject().put("op", "run").put("run", JSONObject(json))); got = true }   // a finished run from the watch
                path.startsWith("/gym/del/") -> { push(ctx, JSONObject().put("op", "del").put("id", path.substringAfterLast('/').toLongOrNull() ?: continue)); got = true }
                else -> continue
            }
            Wearable.getDataClient(ctx).deleteDataItems(Uri.Builder().scheme("wear").authority(item.uri.host).path(path).build())   // handled: free it
        }
        if (got) { ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("lastIn", System.currentTimeMillis()).apply(); HealthConnectPlugin.instance?.wearPing() }
    }
}

class WearListener : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) = WearSync.handle(applicationContext, events)
}

package io.github.missileminion.dashboard

import android.content.Context
import android.net.Uri
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

    fun publishState(ctx: Context, json: String) {
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
                path.startsWith("/gym/del/") -> { push(ctx, JSONObject().put("op", "del").put("id", path.substringAfterLast('/').toLongOrNull() ?: continue)); got = true }
                else -> continue
            }
            Wearable.getDataClient(ctx).deleteDataItems(Uri.Builder().scheme("wear").authority(item.uri.host).path(path).build())   // handled: free it
        }
        if (got) HealthConnectPlugin.instance?.wearPing()
    }
}

class WearListener : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) = WearSync.handle(applicationContext, events)
}

package com.rhozly.wear.data.model

import kotlinx.serialization.Serializable

/** One home the signed-in user belongs to (for the switcher). */
@Serializable
data class HomeOption(val id: String, val name: String)

/** A `home_members` row with the embedded home — the shape of
 *  `home_members.select("homes(id, name)").eq("user_id", uid)`. */
@Serializable
data class HomeMemberRow(val homes: HomeOption? = null)

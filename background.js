// To map ticket IDs to group IDs, with persistence
let ticketGroupMap = new Map();

// Load the ticketGroupMap from storage when the extension starts
chrome.storage.local.get("ticketGroupMap", data => {
    if (data.ticketGroupMap) {
        ticketGroupMap = new Map(data.ticketGroupMap);
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if ((changeInfo.title || tab.url) && (tab.url.includes("bitbucket.org") || tab.url.includes("atlassian.net"))) {
        // Extract "Hotfix" from the title
        const isHotfix = changeInfo.title && changeInfo.title.toLowerCase().includes("hotfix");

        // Try to extract ticket ID from the title first
        let ticketID = changeInfo.title && changeInfo.title.match(/([A-Z]+-\d+)/);
        
        // If ticket ID is not found in the title, check the URL
        if (!ticketID) {
            const urlParams = new URLSearchParams(new URL(tab.url).search);
            ticketID = urlParams.get('issueKey');
        } else if (Array.isArray(ticketID)) {
            ticketID = ticketID[0];  // Extract the first match if it's an array
        }

        const groupName = isHotfix ? "Hotfix" : ticketID;

        if (groupName && chrome.tabGroups) {
            let targetGroupId = null;

            if (isHotfix) {
                // Handle Hotfix group
                chrome.tabGroups.query({}, groups => {
                    for (const group of groups) {
                        if (group.title === "Hotfix") {
                            targetGroupId = group.id;
                            break;
                        }
                    }

                    if (targetGroupId === null) {
                        // Create a new Hotfix group if it doesn't exist
                        chrome.tabs.group({ tabIds: tabId }, groupId => {
                            chrome.tabGroups.update(groupId, { title: "Hotfix", collapsed: false });
                        });
                    } else {
                        // Move the tab to the existing Hotfix group and expand it
                        chrome.tabs.group({ tabIds: tabId, groupId: targetGroupId }, () => {
                            chrome.tabGroups.update(targetGroupId, { collapsed: false });
                        });
                    }
                });
            } else if (ticketID) {
                // Check if this ticket ID already has a group
                if (ticketGroupMap.has(ticketID)) {
                    targetGroupId = ticketGroupMap.get(ticketID);
                }

                if (targetGroupId === null) {
                    // Check if a group with the ticket ID exists, regardless of its name
                    chrome.tabGroups.query({}, groups => {
                        for (const group of groups) {
                            if (group.title === groupName) {
                                targetGroupId = group.id;
                                ticketGroupMap.set(groupName, targetGroupId);
                                saveTicketGroupMap(); // Persist the map
                                break;
                            }
                        }

                        if (targetGroupId === null) {
                            // Create a new group if it doesn't exist
                            chrome.tabs.group({ tabIds: tabId }, groupId => {
                                chrome.tabGroups.update(groupId, { title: groupName, collapsed: false });
                                ticketGroupMap.set(groupName, groupId);
                                saveTicketGroupMap(); // Persist the map
                            });
                        } else {
                            // Move the tab to the existing group and expand it
                            moveTabToGroup(tabId, targetGroupId, groupName);
                        }
                    });
                } else {
                    // Move the tab to the mapped group and expand it
                    moveTabToGroup(tabId, targetGroupId, groupName);
                }
            }
        }
    }
});

// Function to move a tab to a group with error handling
function moveTabToGroup(tabId, groupId, groupName) {
    chrome.tabs.group({ tabIds: tabId, groupId: groupId }, () => {
        if (chrome.runtime.lastError) {
            console.error(`Failed to move tab to group: ${chrome.runtime.lastError.message}`);
            // If the group ID is invalid, remove it from the map
            ticketGroupMap.delete(groupName);
            saveTicketGroupMap();
        } else {
            chrome.tabGroups.update(groupId, { collapsed: false });
        }
    });
}

// Helper function to save the ticketGroupMap to storage
function saveTicketGroupMap() {
    const mapAsArray = Array.from(ticketGroupMap.entries());
    chrome.storage.local.set({ ticketGroupMap: mapAsArray });
}

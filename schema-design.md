- quote
	- fields
		- text
		- owner_id
		- public?
		- speaker
		- link
		- link_site
		- tags
		
		
	- indexes
		- speaker (for distinct)
		- link_site (for distinct/stats)
		- tags (for distinct/search)
		- owner_id+public

- quote_list
	- fields
		- name
		- owner_id
		- public?
		- quote_ids
		- tags
	
	- indexes
		- name (for search)
		- owner_id+public
		- tags (for distinct/search)
